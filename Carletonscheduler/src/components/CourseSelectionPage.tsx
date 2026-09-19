import { useState, useRef, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import { searchCourses, getCourseByCode, type Course } from '../utils/courseData';
import type { ElectiveRequirement } from '../types/electives';
import { getVisibleTerms, getTermLabel, getTermShortLabel } from '../utils/termUtils';
import { buildElectiveToken, getElectiveSlotCount, getElectiveTokenCategory, getElectiveTokenIndex, getMissingElectiveTokenNumbers } from '../utils/electiveUtils';
import {
  validatePrerequisitesFromTree,
  type PrerequisiteValidationResult,
  type StudentTranscript
} from '@shared/prerequisite-evaluator';
import { fetchElectiveCatalog } from '../utils/electiveCatalog';
import { mergeElectiveRequirements } from '../utils/electiveRequirements';
import {
  AuditSummaryCard,
  CourseSelectionHeader,
  GenerateScheduleSidebar,
  ManualElectivePicker,
  SearchPanel,
  SelectedCoursesPanel,
  TermSelectionTabs,
} from './course-selection/CourseSelectionSections';

const DEBOUNCE_MS = 300;

interface CourseSelectionPageProps {
  hasAuditData: boolean;
  completedCourses: string[];
  currentCourses: Array<{ courseId: string; term: string }>;
  remainingCourses?: string[];
  electiveRequirements?: ElectiveRequirement[];
  onElectiveRequirementsChange: (requirements: ElectiveRequirement[]) => void;
  studentInfo?: {
    name: string;
    studentId: string;
    program: string;
  };
  onGenerateSchedules: (courses: string[], termOverride?: string) => void;
  onStartOver: () => void;
  activeTerm: string;
  onTermChange: (term: string) => void;
}

export function CourseSelectionPage({
  hasAuditData,
  completedCourses,
  currentCourses,
  remainingCourses = [],
  electiveRequirements = [],
  onElectiveRequirementsChange,
  studentInfo,
  onGenerateSchedules,
  onStartOver,
  activeTerm,
  onTermChange
}: CourseSelectionPageProps) {
  const [catalogElectiveRequirements, setCatalogElectiveRequirements] = useState<ElectiveRequirement[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Course[]>([]);
  const [selectedCourses, setSelectedCourses] = useState<string[]>([]);
  const [courseDetails, setCourseDetails] = useState<Map<string, Course>>(new Map());
  const [showResults, setShowResults] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [prerequisiteValidation, setPrerequisiteValidation] = useState<Record<string, PrerequisiteValidationResult>>({});
  const [completedOpen, setCompletedOpen] = useState(false);
  const [enrolledOpen, setEnrolledOpen] = useState(false);
  const [remainingOpen, setRemainingOpen] = useState(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const availableElectiveRequirements = mergeElectiveRequirements(electiveRequirements, catalogElectiveRequirements);

  useEffect(() => {
    let cancelled = false;

    const loadElectiveCatalog = async () => {
      const catalog = await fetchElectiveCatalog();
      if (!cancelled) {
        setCatalogElectiveRequirements(catalog);
      }
    };

    loadElectiveCatalog();

    return () => {
      cancelled = true;
    };
  }, []);

  // Pre-fetch details for remaining courses to know their semesters
  useEffect(() => {
    if (remainingCourses.length > 0) {
      const fetchAllRemaining = async () => {
        setIsLoadingDetails(true);
        const coursePromises = remainingCourses.map(code => getCourseByCode(code));
        const courses = await Promise.all(coursePromises);
        
        setCourseDetails(prev => {
          const newMap = new Map(prev);
          courses.forEach(course => {
            if (course) {
              newMap.set(course.code, course);
            }
          });
          return newMap;
        });
        setIsLoadingDetails(false);
      };
      fetchAllRemaining();
    }
  }, [remainingCourses]);

  const CURRENT_TERM = activeTerm;

  // Derive visible terms from the system clock
  const visibleTerms = getVisibleTerms();

  const getSemesterName = (termCode: string) => getTermLabel(termCode);
  const getSemesterShortName = (termCode: string) => getTermShortLabel(termCode);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  // Auto-dismiss toast after 3 seconds
  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 3000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  const performSearch = useCallback(async (query: string) => {
    if (query.trim().length < 2) {
      setSearchResults([]);
      setShowResults(false);
      setIsSearching(false);
      return;
    }
    
    const results = await searchCourses(query, CURRENT_TERM);
    setSearchResults(results);
    setShowResults(true);
    setIsSearching(false);
  }, [CURRENT_TERM]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    
    // Clear previous debounce timer
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    
    if (!query.trim() || query.trim().length < 2) {
      setSearchResults([]);
      setShowResults(false);
      setIsSearching(false);
      return;
    }
    
    // Show searching indicator
    setIsSearching(true);
    
    // Debounce the actual search
    debounceRef.current = setTimeout(() => {
      performSearch(query);
    }, DEBOUNCE_MS);
  };

  const addCourse = async (courseCode: string) => {
    if (!selectedCourses.includes(courseCode)) {
      setSelectedCourses([...selectedCourses, courseCode]);
      // Don't fetch details for elective category tokens
      if (!courseCode.startsWith('ELECTIVE:')) {
        const course = await getCourseByCode(courseCode);
        if (course) {
          setCourseDetails(new Map(courseDetails.set(courseCode, course)));

          // If the course is not offered in the active term but is available in
          // current activeTerm but IS available in another visible term, pivot the
          // UI to that term automatically.
          if (course.terms && course.terms.length > 0 && !course.terms.includes(CURRENT_TERM)) {
            const visibleCodes = visibleTerms.map(vt => vt.code);
            const matchingVisibleTerm = course.terms.find(t => visibleCodes.includes(t));
            if (matchingVisibleTerm) {
              onTermChange(matchingVisibleTerm);
              setToastMessage(`Switching view to ${getTermLabel(matchingVisibleTerm)} to match your selection.`);
            }
          }
        }
      }
    }
    setSearchQuery('');
    setSearchResults([]);
    setShowResults(false);
  };

  const addAllCourses = async (courseCodes: string[]) => {
    // Only add courses offered in the currently active tab.
    const filteredCodes = courseCodes.filter(code => {
      if (code.startsWith('ELECTIVE:')) return true; // Always include elective tokens
      const details = courseDetails.get(code);
      if (!details || !details.terms) return false;
      return details.terms.includes(CURRENT_TERM);
    });
    const toAdd = filteredCodes.filter(c => !selectedCourses.includes(c));
    if (toAdd.length === 0) return;
    
    setSelectedCourses(prev => [...prev, ...toAdd]);
    
    // Only fetch details for non-elective-token courses
    const realCourses = toAdd.filter(c => !c.startsWith('ELECTIVE:'));
    const coursePromises = realCourses.map(code => getCourseByCode(code));
    const courses = await Promise.all(coursePromises);
    
    setCourseDetails(prev => {
      const newMap = new Map(prev);
      courses.forEach((course, index) => {
        if (course) {
          newMap.set(realCourses[index], course);
        }
      });
      return newMap;
    });
  };

  const removeCourse = (courseCode: string) => {
    setSelectedCourses(selectedCourses.filter(code => code !== courseCode));
  };

  const addElectiveCategory = (category: string) => {
    const existingIndices = selectedCourses
      .filter((code) => getElectiveTokenCategory(code) === category)
      .map((code) => getElectiveTokenIndex(code))
      .filter((index): index is number => index !== null);

    const nextIndex = existingIndices.length > 0 ? Math.max(...existingIndices) + 1 : 1;
    const token = buildElectiveToken(category, nextIndex);

    const mergedRequirements = mergeElectiveRequirements(electiveRequirements, catalogElectiveRequirements);
    if (mergedRequirements.length !== electiveRequirements.length) {
      onElectiveRequirementsChange(mergedRequirements);
    }

    setSelectedCourses((prev) => prev.includes(token) ? prev : [...prev, token]);
  };

  useEffect(() => {
    if (!hasAuditData) {
      setPrerequisiteValidation({});
      return;
    }

    const courseCodes = Array.from(new Set([
      ...remainingCourses,
      ...selectedCourses.filter(code => !code.startsWith('ELECTIVE:')),
    ]));

    if (courseCodes.length === 0) {
      setPrerequisiteValidation({});
      return;
    }

    let isCancelled = false;

    const loadValidation = async () => {
      try {
        const transcript: StudentTranscript = {
          completedCourses: completedCourses.map(courseId => courseId.toUpperCase()),
          currentYear: 'FOURTH_YEAR',
          hasSpecialPermission: false,
        };

        const results = Object.fromEntries(
          courseCodes.map((courseId) => {
            const course = courseDetails.get(courseId);
            return [
              courseId,
              validatePrerequisitesFromTree(
                course?.prerequisiteExpression,
                course?.prerequisiteTree || [],
                transcript
              ),
            ] as const;
          })
        );

        if (!isCancelled) {
          setPrerequisiteValidation(results);
        }
      } catch {
        if (!isCancelled) {
          setPrerequisiteValidation({});
        }
      }
    };

    loadValidation();

    return () => {
      isCancelled = true;
    };
  }, [hasAuditData, remainingCourses, selectedCourses, completedCourses, courseDetails]);

  const areAllPrerequisitesMet = (courseCode: string): boolean => {
    if (!hasAuditData) return true;
    const validation = prerequisiteValidation[courseCode];
    if (!validation) return true;
    return validation.isValid;
  };

  const getMissingPrerequisites = (courseCode: string): string[] => {
    const validation = prerequisiteValidation[courseCode];
    return validation?.missingCourses || [];
  };

  const handleGenerateSchedules = () => {
    // Separate elective tokens from regular courses
    const electiveTokens = selectedCourses.filter(code => code.startsWith('ELECTIVE:'));
    const regularCourses = selectedCourses.filter(code => !code.startsWith('ELECTIVE:'));
    
    const coursesWithSections = regularCourses.filter(code => {
      const course = courseDetails.get(code);
      return course && course.hasSections !== false;
    });
    
    if (coursesWithSections.length === 0 && electiveTokens.length === 0) {
      alert('None of the selected courses have sections available in the database.\n\nPlease select different courses or check back later.');
      return;
    }
    
    const skippedRegular = regularCourses.filter(code => !coursesWithSections.includes(code));
    if (skippedRegular.length > 0) {
      alert(`The following courses will be skipped (no sections available):\n${skippedRegular.join(', ')}\n\nGenerating schedule with ${coursesWithSections.length} courses${electiveTokens.length > 0 ? ` + ${electiveTokens.length} elective category(s)` : ''}.`);
    }
    
    // Pass both regular courses and elective tokens to App.tsx
    onGenerateSchedules([...coursesWithSections, ...electiveTokens], CURRENT_TERM);
  };

  const handleAutoFillSelection = async () => {
    setIsGenerating(true);
    try {
      const unresolvedCodes = remainingCourses.filter(code => !courseDetails.has(code));
      if (unresolvedCodes.length > 0) {
        const fetchedCourses = await Promise.all(unresolvedCodes.map(code => getCourseByCode(code)));
        setCourseDetails(prev => {
          const newMap = new Map(prev);
          fetchedCourses.forEach(course => {
            if (course) {
              newMap.set(course.code, course);
            }
          });
          return newMap;
        });
      }

      const detailsMap = new Map(courseDetails);
      if (unresolvedCodes.length > 0) {
        const fetchedCourses = await Promise.all(unresolvedCodes.map(code => getCourseByCode(code)));
        fetchedCourses.forEach(course => {
          if (course) {
            detailsMap.set(course.code, course);
          }
        });
      }

      const transcript: StudentTranscript = {
        completedCourses: completedCourses.map(courseId => courseId.toUpperCase()),
        currentYear: 'FOURTH_YEAR',
        hasSpecialPermission: false,
      };
      const validationResults = hasAuditData
        ? Object.fromEntries(
            remainingCourses.map((courseId) => {
              const course = detailsMap.get(courseId);
              return [
                courseId,
                validatePrerequisitesFromTree(
                  course?.prerequisiteExpression,
                  course?.prerequisiteTree || [],
                  transcript
                ),
              ] as const;
            })
          )
        : {};

      const maxCourses = 6;
      const autoSelected: string[] = [];

      for (const code of remainingCourses) {
        if (autoSelected.length >= maxCourses) break;
        const details = detailsMap.get(code);
        if (!details) continue;
        const isOfferedNow = details.terms?.includes(CURRENT_TERM);
        if (!isOfferedNow) continue;
        if (hasAuditData && validationResults[code] && !validationResults[code].isValid) continue;
        autoSelected.push(code);
      }

      if (autoSelected.length < maxCourses) {
        for (const elective of electiveRequirements) {
          if (autoSelected.length >= maxCourses) break;
          const slotCount = getElectiveSlotCount(elective);
          for (const tokenNumber of getMissingElectiveTokenNumbers([], elective.category, slotCount)) {
            if (autoSelected.length >= maxCourses) break;
            autoSelected.push(buildElectiveToken(elective.category, tokenNumber));
          }
        }
      }

      setSelectedCourses(autoSelected);
    } finally {
      setIsGenerating(false);
    }
  };

  const coursesWithSectionsCount = selectedCourses.filter(code => {
    if (code.startsWith('ELECTIVE:')) return true; // Elective tokens always count
    const course = courseDetails.get(code);
    return course && course.hasSections !== false;
  }).length;

  return (
    <div className="min-h-screen" style={{ background: '#f8fafc' }}>
      <main className="max-w-5xl mx-auto" style={{ padding: '40px 24px 64px' }}>
        <CourseSelectionHeader onStartOver={onStartOver} />
        <TermSelectionTabs
          visibleTerms={visibleTerms}
          currentTerm={CURRENT_TERM}
          onTermChange={onTermChange}
          getTermLabel={getTermLabel}
        />
        <AuditSummaryCard
          hasAuditData={hasAuditData}
          studentInfo={studentInfo}
          completedCourses={completedCourses}
          currentCourses={currentCourses}
          remainingCourses={remainingCourses}
          electiveRequirements={electiveRequirements}
          selectedCourses={selectedCourses}
          courseDetails={courseDetails}
          currentTerm={CURRENT_TERM}
          completedOpen={completedOpen}
          enrolledOpen={enrolledOpen}
          remainingOpen={remainingOpen}
          isLoadingDetails={isLoadingDetails}
          isGenerating={isGenerating}
          onToggleCompleted={() => setCompletedOpen(!completedOpen)}
          onToggleEnrolled={() => setEnrolledOpen(!enrolledOpen)}
          onToggleRemaining={() => setRemainingOpen(!remainingOpen)}
          onGenerateSmartSchedule={handleAutoFillSelection}
          onAddCourse={addCourse}
          onAddAllCourses={addAllCourses}
          onRemoveCourse={removeCourse}
          onClearSelected={() => setSelectedCourses([])}
          areAllPrerequisitesMet={areAllPrerequisitesMet}
          getMissingPrerequisites={getMissingPrerequisites}
          getTermLabel={getSemesterName}
          getTermShortLabel={getSemesterShortName}
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '24px' }}>
          <div className="space-y-4">
            <SearchPanel
              searchRef={searchRef}
              searchQuery={searchQuery}
              searchResults={searchResults}
              showResults={showResults}
              isSearching={isSearching}
              selectedCourses={selectedCourses}
              currentTerm={CURRENT_TERM}
              onSearch={handleSearch}
              onFocus={() => searchQuery.length >= 2 && searchResults.length > 0 && setShowResults(true)}
              onAddCourse={addCourse}
              getTermLabel={getSemesterName}
            />
            <ManualElectivePicker
              electiveRequirements={availableElectiveRequirements}
              selectedCourses={selectedCourses}
              onAddElectiveCategory={addElectiveCategory}
            />
            <SelectedCoursesPanel
              selectedCourses={selectedCourses}
              completedCourses={completedCourses}
              courseDetails={courseDetails}
              electiveRequirements={availableElectiveRequirements}
              hasAuditData={hasAuditData}
              onRemoveCourse={removeCourse}
              areAllPrerequisitesMet={areAllPrerequisitesMet}
              prerequisiteValidation={prerequisiteValidation}
            />
          </div>

          <GenerateScheduleSidebar
            selectedCourses={selectedCourses}
            coursesWithSectionsCount={coursesWithSectionsCount}
            currentTerm={CURRENT_TERM}
            hasAuditData={hasAuditData}
            onGenerateSchedules={handleGenerateSchedules}
            getTermLabel={getTermLabel}
          />
        </div>
      </main>

      {/* Toast notification */}
      {toastMessage && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3"
          style={{
            padding: '14px 20px',
            background: '#111',
            color: '#fff',
            borderRadius: '10px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
            fontSize: '14px',
            fontWeight: 500,
          }}
        >
          {toastMessage}
          <button
            onClick={() => setToastMessage(null)}
            className="p-1 rounded hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
