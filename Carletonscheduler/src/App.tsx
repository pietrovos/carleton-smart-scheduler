import { useState, useEffect, useCallback } from 'react';
import { AcademicHistoryImport } from './components/AcademicHistoryImport';
import { CourseSelectionPage } from './components/CourseSelectionPage';
import { ScheduleReviewPage } from './components/ScheduleReviewPage';
import { LoginPage } from './components/LoginPage';
import { AdminPage } from './components/admin';
import { generateSchedules, type GeneratedSchedule } from './utils/scheduleGenerator';
import { API_BASE_URL, authenticatedFetch } from './config/constants';
import { getDefaultActiveTerm } from './utils/termUtils';
import type { ElectiveRequirement } from './types/electives';
import { collectRequestedElectiveCounts, getSelectionUnitCredits } from './utils/electiveUtils';
import { fetchElectiveCatalog } from './utils/electiveCatalog';
import { mergeElectiveRequirements } from './utils/electiveRequirements';

type AppPage = 'import' | 'course-selection' | 'schedule-review' | 'admin';

interface StudentInfo {
  name: string;
  studentId: string;
  program: string;
}

interface CurrentCourse {
  courseId: string;
  term: string;
}

interface ParsedAuditData {
  completedCourses: Array<{ courseId: string; grade?: string }>;
  currentCourses: CurrentCourse[];
  remainingCourses: string[];
  electiveRequirements?: ElectiveRequirement[];
  studentName?: string;
  studentId?: string;
  program?: string;
}

interface AppState {
  currentPage: AppPage;
  hasAuditData: boolean;
  completedCourses: string[];
  currentCourses: CurrentCourse[];
  remainingCourses: string[];
  electiveRequirements: ElectiveRequirement[];
  studentInfo?: StudentInfo;
  generatedSchedules: GeneratedSchedule[];
  selectedElectives: Record<string, string[]>; // category -> selected course codes
  selectedElectiveCredits: Record<string, number>; // category -> requested elective credits from selection page
  activeTerm: string;
}

const STORAGE_KEY = 'scheduler-state';

const pageToPath: Record<AppPage, string> = {
  'import': '/',
  'course-selection': '/courses',
  'schedule-review': '/schedules',
  'admin': '/admin'
};

const pathToPage: Record<string, AppPage> = {
  '/': 'import',
  '/courses': 'course-selection',
  '/schedules': 'schedule-review',
  '/admin': 'admin'
};

function getInitialPage(): AppPage {
  const path = window.location.pathname;
  return pathToPage[path] || 'import';
}

function loadState(): Partial<AppState> | null {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

function saveState(state: AppState) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors
  }
}

function clearState() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(!!localStorage.getItem('auth_token'));
  const [user, setUser] = useState<any>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(isAuthenticated);

  const initialPage = getInitialPage();
  
  // If URL is explicitly '/', clear state and start fresh
  if (initialPage === 'import') {
    clearState();
  }
  
  const savedState = initialPage === 'import' ? null : loadState();
  
  // Admin page doesn't require any saved state - allow direct access
  // Other pages need saved state to function properly
  const hasRequiredData = savedState && (
    (initialPage === 'course-selection') ||
    (initialPage === 'schedule-review' && (savedState.generatedSchedules?.length ?? 0) > 0)
  );
  
  const [currentPage, setCurrentPage] = useState<AppPage>(
    initialPage === 'admin' ? 'admin' :
    hasRequiredData ? initialPage : 
    (initialPage === 'import' ? 'import' : (savedState?.currentPage || 'import'))
  );
  const [hasAuditData, setHasAuditData] = useState(savedState?.hasAuditData || false);
  const [completedCourses, setCompletedCourses] = useState<string[]>(savedState?.completedCourses || []);
  const [currentCourses, setCurrentCourses] = useState<CurrentCourse[]>(savedState?.currentCourses || []);
  const [remainingCourses, setRemainingCourses] = useState<string[]>(savedState?.remainingCourses || []);
  const [electiveRequirements, setElectiveRequirements] = useState<ElectiveRequirement[]>(savedState?.electiveRequirements || []);
  const [studentInfo, setStudentInfo] = useState<StudentInfo | undefined>(savedState?.studentInfo);
  const [generatedSchedules, setGeneratedSchedules] = useState<GeneratedSchedule[]>(savedState?.generatedSchedules || []);
  const [selectedElectives, setSelectedElectives] = useState<Record<string, string[]>>(savedState?.selectedElectives || {});
  const [selectedElectiveCredits, setSelectedElectiveCredits] = useState<Record<string, number>>(savedState?.selectedElectiveCredits || {});
  const [activeTerm, setActiveTerm] = useState<string>(savedState?.activeTerm || getDefaultActiveTerm());

  useEffect(() => {
    if (!isAuthenticated) {
      setIsCheckingSession(false);
      return;
    }

    authenticatedFetch(`${API_BASE_URL}/auth/me`)
      .then(async response => {
        if (!response.ok) throw new Error('Invalid session');
        setUser(await response.json());
      })
      .catch(() => {
        localStorage.removeItem('auth_token');
        setIsAuthenticated(false);
        setUser(null);
      })
      .finally(() => setIsCheckingSession(false));
  }, [isAuthenticated]);

  // Navigate to a page and update URL
  const navigateTo = useCallback((page: AppPage, replace = false) => {
    const path = pageToPath[page];
    if (replace) {
      window.history.replaceState({ page }, '', path);
    } else {
      window.history.pushState({ page }, '', path);
    }
    setCurrentPage(page);
  }, []);

  // Save state whenever it changes
  useEffect(() => {
    const state: AppState = {
      currentPage,
      hasAuditData,
      completedCourses,
      currentCourses,
      remainingCourses,
      electiveRequirements,
      studentInfo,
      generatedSchedules,
      selectedElectives,
      selectedElectiveCredits,
      activeTerm,
    };
    saveState(state);
  }, [currentPage, hasAuditData, completedCourses, currentCourses, remainingCourses, electiveRequirements, studentInfo, generatedSchedules, selectedElectives, selectedElectiveCredits, activeTerm]);

  // Sync URL with current page on mount
  useEffect(() => {
    const currentPath = window.location.pathname;
    const expectedPath = pageToPath[currentPage];
    if (currentPath !== expectedPath) {
      window.history.replaceState({ page: currentPage }, '', expectedPath);
    }
  }, []);

  // Handle browser back/forward
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      if (event.state?.page) {
        setCurrentPage(event.state.page);
      } else {
        // Fallback: parse URL
        const page = pathToPage[window.location.pathname] || 'import';
        setCurrentPage(page);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleStartOver = () => {
    setHasAuditData(false);
    setCompletedCourses([]);
    setCurrentCourses([]);
    setRemainingCourses([]);
    setElectiveRequirements([]);
    setStudentInfo(undefined);
    setGeneratedSchedules([]);
    setSelectedElectives({});
    setSelectedElectiveCredits({});
    setActiveTerm(getDefaultActiveTerm());
    clearState();
    navigateTo('import');
  };

  const handleManualEntry = () => {
    setHasAuditData(true);
    setCompletedCourses([
      'ECOR 1010', 'ECOR 1042', 'ECOR 1043', 'ECOR 1044', 
      'ECOR 1045', 'MATH 1004', 'MATH 1104', 'COMP 1405'
    ]);
    navigateTo('course-selection');
  };

  const handleUploadComplete = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/audit/parse`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const error = await response.json();
        alert(`Failed to parse audit file: ${error.message || 'Unknown error'}. Please try manual entry.`);
        return;
      }

      const data: ParsedAuditData = await response.json();
      const completedCourseIds = data.completedCourses.map(course => course.courseId);

      setStudentInfo({
        name: data.studentName || 'Student',
        studentId: data.studentId || '',
        program: data.program || 'Engineering'
      });
      setHasAuditData(true);
      setCompletedCourses(completedCourseIds);
      setCurrentCourses(data.currentCourses || []);
      setRemainingCourses(data.remainingCourses || []);
      setElectiveRequirements(data.electiveRequirements || []);
      navigateTo('course-selection');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      alert(`Error uploading file: ${message}. Please try manual entry.`);
    }
  };

  const handleGenerateSchedules = async (courses: string[], termOverride?: string) => {
    const termToUse = termOverride || activeTerm;
    try {
      const regularCourses = courses.filter(course => !course.startsWith('ELECTIVE:'));
      const requestedElectiveCounts = collectRequestedElectiveCounts(courses);
      const requestedCredits: Record<string, number> = {};
      let effectiveElectiveRequirements = electiveRequirements;

      const missingCategories = Array.from(requestedElectiveCounts.keys()).filter((category) =>
        !effectiveElectiveRequirements.some((item) => item.category === category)
      );

      if (missingCategories.length > 0) {
        const catalogRequirements = await fetchElectiveCatalog();
        effectiveElectiveRequirements = mergeElectiveRequirements(
          effectiveElectiveRequirements,
          catalogRequirements.filter((item) => missingCategories.includes(item.category))
        );
        setElectiveRequirements(effectiveElectiveRequirements);
      }

      for (const [category, tokenCount] of requestedElectiveCounts.entries()) {
        const requirement = effectiveElectiveRequirements.find(item => item.category === category);
        if (!requirement) continue;

        const selectionUnitCredits = getSelectionUnitCredits(requirement);
        const maxRequestableCredits = requirement.creditsNeeded > 0
          ? requirement.creditsNeeded
          : tokenCount * selectionUnitCredits;
        requestedCredits[category] = Math.min(tokenCount * selectionUnitCredits, maxRequestableCredits);
      }

      setSelectedElectives({});
      setSelectedElectiveCredits(requestedCredits);

      if (regularCourses.length === 0 && Object.keys(requestedCredits).length === 0) {
        alert('Select at least one course or elective category before generating schedules.');
        return;
      }

      if (regularCourses.length === 0) {
        setGeneratedSchedules([{
          id: 1,
          selections: [],
          hasUnmetPrerequisites: false,
          prerequisiteInfo: {},
        }]);
        navigateTo('schedule-review');
        return;
      }

      const schedules = await generateSchedules(regularCourses, completedCourses, termToUse);

      if (schedules.length === 0) {
        alert('No schedules could be generated. The selected courses may have time conflicts or no available sections.');
        return;
      }

      setGeneratedSchedules(schedules);
      navigateTo('schedule-review');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      alert(`Failed to generate schedules: ${message}`);
    }
  };

  const handleBackToCourseSelection = () => {
    navigateTo('course-selection');
  };

  const handleLoginSuccess = (token: string, userData: any) => {
    setIsAuthenticated(true);
    setUser(userData);
    setIsCheckingSession(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    setIsAuthenticated(false);
    setUser(null);
    handleStartOver();
  };

  if (isCheckingSession) return null;

  if (!isAuthenticated) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="relative min-h-screen">
      <div className="absolute top-4 right-4 z-50">
        <button 
          onClick={handleLogout}
          className="text-sm font-medium text-gray-500 hover:text-[#E5173F] transition-colors bg-white/80 px-3 py-1 rounded-full border border-gray-200 shadow-sm"
        >
          Sign Out
        </button>
      </div>

      {currentPage === 'schedule-review' && (
        <ScheduleReviewPage
          schedules={generatedSchedules}
          onBack={handleBackToCourseSelection}
          electiveRequirements={electiveRequirements}
          selectedElectives={selectedElectives}
          selectedElectiveCredits={selectedElectiveCredits}
          activeTerm={activeTerm}
          onElectiveChange={async (category: string, courseCodes: string[], allSelectedCourses: string[]) => {
            setSelectedElectives(prev => ({ ...prev, [category]: courseCodes }));
            // Re-generate schedules with the new electives swapped in
            try {
              if (allSelectedCourses.length === 0) {
                setGeneratedSchedules([{
                  id: 1,
                  selections: [],
                  hasUnmetPrerequisites: false,
                  prerequisiteInfo: {},
                }]);
                return;
              }

              const schedules = await generateSchedules(allSelectedCourses, completedCourses, activeTerm);
              if (schedules.length > 0) {
                setGeneratedSchedules(schedules);
              }
            } catch (error) {
              const message = error instanceof Error ? error.message : 'Unknown error';
              alert(`Failed to regenerate schedules: ${message}`);
            }
          }}
          completedCourses={completedCourses}
        />
      )}

      {currentPage === 'course-selection' && (
        <CourseSelectionPage
          hasAuditData={hasAuditData}
          completedCourses={completedCourses}
          currentCourses={currentCourses}
          remainingCourses={remainingCourses}
          electiveRequirements={electiveRequirements}
          onElectiveRequirementsChange={setElectiveRequirements}
          studentInfo={studentInfo}
          onGenerateSchedules={handleGenerateSchedules}
          onStartOver={handleStartOver}
          activeTerm={activeTerm}
          onTermChange={setActiveTerm}
        />
      )}

      {currentPage === 'import' && (
        <AcademicHistoryImport
          onManualEntry={handleManualEntry}
          onUploadComplete={handleUploadComplete}
        />
      )}

      {currentPage === 'admin' && user?.role === 'ADMIN' && (
        <AdminPage />
      )}

      {currentPage === 'admin' && user?.role !== 'ADMIN' && (
        <div className="flex min-h-screen items-center justify-center">Administrator access required.</div>
      )}
    </div>
  );
}
