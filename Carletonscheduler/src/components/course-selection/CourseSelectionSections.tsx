import { type RefObject } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '../ui/hover-card';
import type { Course, PrerequisiteValidationResult } from '../../utils/courseData';
import type { ElectiveRequirement } from '../../types/electives';
import {
  buildElectiveToken,
  getElectiveSlotCount,
  getElectiveTokenCategory,
  getMissingElectiveTokenNumbers,
  getSelectedElectiveTokenCount,
  getSelectionUnitCredits,
} from '../../utils/electiveUtils';

interface VisibleTerm {
  code: string;
  role: 'previous' | 'current' | 'upcoming';
}

interface StudentInfo {
  name: string;
  studentId: string;
  program: string;
}

interface CurrentCourse {
  courseId: string;
  term: string;
}

interface CourseSelectionHeaderProps {
  onStartOver: () => void;
}

export function CourseSelectionHeader({ onStartOver }: CourseSelectionHeaderProps) {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-1">
        <h1 style={{ 
          fontSize: '28px', 
          fontWeight: 600, 
          color: '#111', 
          letterSpacing: '-0.02em',
          lineHeight: 1.2 
        }}>
          Course Selection
        </h1>
        <button
          onClick={onStartOver}
          className="text-sm text-slate-500 hover:text-slate-700 transition-colors"
          style={{ fontWeight: 500 }}
        >
          Start over
        </button>
      </div>
      <p style={{ fontSize: '15px', color: '#64748b', lineHeight: 1.5 }}>
        Choose courses for your upcoming term
      </p>
    </div>
  );
}

interface TermSelectionTabsProps {
  visibleTerms: VisibleTerm[];
  currentTerm: string;
  onTermChange: (term: string) => void;
  getTermLabel: (term: string) => string;
}

export function TermSelectionTabs({
  visibleTerms,
  currentTerm,
  onTermChange,
  getTermLabel,
}: TermSelectionTabsProps) {
  return (
    <div 
      className="flex items-center gap-1 mb-8 p-1 rounded-lg"
      style={{ background: '#f1f5f9', width: 'fit-content' }}
    >
      {visibleTerms.map((vt) => {
        const isActive = vt.code === currentTerm;
        return (
          <button
            key={vt.code}
            onClick={() => onTermChange(vt.code)}
            className="px-4 py-2 rounded-md text-sm transition-all"
            style={{
              fontWeight: 500,
              background: isActive ? '#fff' : 'transparent',
              color: isActive ? '#111' : '#64748b',
              boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            {getTermLabel(vt.code)}
          </button>
        );
      })}
    </div>
  );
}

interface AuditSummaryCardProps {
  hasAuditData: boolean;
  studentInfo?: StudentInfo;
  completedCourses: string[];
  currentCourses: CurrentCourse[];
  remainingCourses: string[];
  electiveRequirements: ElectiveRequirement[];
  selectedCourses: string[];
  courseDetails: Map<string, Course>;
  currentTerm: string;
  completedOpen: boolean;
  enrolledOpen: boolean;
  remainingOpen: boolean;
  isLoadingDetails: boolean;
  isGenerating: boolean;
  onToggleCompleted: () => void;
  onToggleEnrolled: () => void;
  onToggleRemaining: () => void;
  onGenerateSmartSchedule: () => Promise<void>;
  onAddCourse: (courseCode: string) => void | Promise<void>;
  onAddAllCourses: (courseCodes: string[]) => void | Promise<void>;
  onRemoveCourse: (courseCode: string) => void;
  onClearSelected: () => void;
  areAllPrerequisitesMet: (courseCode: string) => boolean;
  getMissingPrerequisites: (courseCode: string) => string[];
  getTermLabel: (term: string) => string;
  getTermShortLabel: (term: string) => string;
}

export function AuditSummaryCard({
  hasAuditData,
  studentInfo,
  completedCourses,
  currentCourses,
  remainingCourses,
  electiveRequirements,
  selectedCourses,
  courseDetails,
  currentTerm,
  completedOpen,
  enrolledOpen,
  remainingOpen,
  isLoadingDetails,
  isGenerating,
  onToggleCompleted,
  onToggleEnrolled,
  onToggleRemaining,
  onGenerateSmartSchedule,
  onAddCourse,
  onAddAllCourses,
  onRemoveCourse,
  onClearSelected,
  areAllPrerequisitesMet,
  getMissingPrerequisites,
  getTermLabel,
  getTermShortLabel,
}: AuditSummaryCardProps) {
  if (!hasAuditData || !studentInfo) {
    return null;
  }

  const electiveCourseSet = new Set(electiveRequirements.flatMap(er => er.courseOptions));
  const addableCourses = remainingCourses.filter((code) => {
    if (electiveCourseSet.has(code)) return false;
    const details = courseDetails.get(code);
    if (!details || !details.terms || !details.terms.includes(currentTerm)) return false;
    return areAllPrerequisitesMet(code);
  });

  const electiveTokens = electiveRequirements.flatMap((elective) => {
    const slotCount = getElectiveSlotCount(elective);
    return getMissingElectiveTokenNumbers(selectedCourses, elective.category, slotCount).map(index =>
      buildElectiveToken(elective.category, index),
    );
  });

  const allItems = [...addableCourses, ...electiveTokens];
  const hasUnselected = allItems.some(item => !selectedCourses.includes(item));
  const coreCourses = remainingCourses.filter(code => !electiveCourseSet.has(code));

  return (
    <div
      style={{ 
        marginBottom: '32px', 
        padding: '24px',
        background: '#fff',
        borderRadius: '12px',
        border: '1px solid #e2e8f0'
      }}
    >
      {/* Student Info Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#111', marginBottom: '4px' }}>
            {studentInfo.name}
          </h2>
          <p style={{ fontSize: '14px', color: '#64748b' }}>
            {studentInfo.program}
          </p>
        </div>
        {remainingCourses.length > 0 && (
          <Button
            onClick={onGenerateSmartSchedule}
            disabled={isGenerating}
            size="sm"
          >
            {isGenerating ? 'Generating...' : 'Auto-fill courses'}
          </Button>
        )}
      </div>

      {/* Progress Stats */}
      <div 
        className="flex gap-8 mb-6 pb-6"
        style={{ borderBottom: '1px solid #f1f5f9' }}
      >
        <ProgressStat label="Completed" value={completedCourses.length} />
        <ProgressStat label="In Progress" value={currentCourses.length} />
        <ProgressStat label="Remaining" value={remainingCourses.length} />
      </div>

      {/* Collapsible Sections */}
      <div className="space-y-4">
        <CollapsibleSection
          title="Completed"
          count={completedCourses.length}
          open={completedOpen}
          onToggle={onToggleCompleted}
        >
          <div className="flex flex-wrap gap-2">
            {completedCourses.map((code) => (
              <span 
                key={code} 
                style={{
                  padding: '4px 10px',
                  fontSize: '13px',
                  color: '#64748b',
                  background: '#f8fafc',
                  borderRadius: '4px'
                }}
              >
                {code}
              </span>
            ))}
          </div>
        </CollapsibleSection>

        {currentCourses.length > 0 && (
          <CollapsibleSection
            title="Currently Enrolled"
            count={currentCourses.length}
            open={enrolledOpen}
            onToggle={onToggleEnrolled}
          >
            <div className="flex flex-wrap gap-2">
              {currentCourses.map((course) => (
                <span 
                  key={course.courseId} 
                  style={{
                    padding: '4px 10px',
                    fontSize: '13px',
                    color: '#64748b',
                    background: '#f8fafc',
                    borderRadius: '4px'
                  }}
                >
                  {course.courseId}
                </span>
              ))}
            </div>
          </CollapsibleSection>
        )}

        {remainingCourses.length > 0 && (
          <CollapsibleSection
            title="Remaining Requirements"
            count={remainingCourses.length}
            open={remainingOpen}
            onToggle={onToggleRemaining}
            loading={isLoadingDetails}
          >
            <div className="space-y-6">
              {/* Quick Actions */}
              <div className="flex gap-4">
                {hasUnselected && (
                  <button
                    onClick={() => onAddAllCourses(allItems)}
                    style={{
                      fontSize: '13px',
                      fontWeight: 500,
                      color: '#bf112b',
                    }}
                    className="hover:underline"
                  >
                    Add all available ({addableCourses.length})
                  </button>
                )}
                {selectedCourses.length > 0 && (
                  <button
                    onClick={onClearSelected}
                    style={{
                      fontSize: '13px',
                      fontWeight: 500,
                      color: '#64748b',
                    }}
                    className="hover:underline"
                  >
                    Clear selection
                  </button>
                )}
              </div>

              {/* Core Courses */}
              {coreCourses.length > 0 && (
                <div>
                  <h4 style={{ 
                    fontSize: '12px', 
                    fontWeight: 600, 
                    color: '#94a3b8', 
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: '12px'
                  }}>
                    Core Courses
                  </h4>
                  <RemainingCoreCourseList
                    coreCourses={coreCourses}
                    selectedCourses={selectedCourses}
                    courseDetails={courseDetails}
                    currentTerm={currentTerm}
                    onAddCourse={onAddCourse}
                    onRemoveCourse={onRemoveCourse}
                    areAllPrerequisitesMet={areAllPrerequisitesMet}
                    getMissingPrerequisites={getMissingPrerequisites}
                    getTermLabel={getTermLabel}
                    getTermShortLabel={getTermShortLabel}
                  />
                </div>
              )}

              {/* Electives */}
              {electiveRequirements.length > 0 && (
                <div>
                  <h4 style={{ 
                    fontSize: '12px', 
                    fontWeight: 600, 
                    color: '#94a3b8', 
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: '12px'
                  }}>
                    Electives
                  </h4>
                  <ElectiveRequirementList
                    electiveRequirements={electiveRequirements}
                    selectedCourses={selectedCourses}
                    onAddCourse={onAddCourse}
                  />
                </div>
              )}

              {electiveRequirements.length === 0 && coreCourses.length === 0 && (
                <FallbackRemainingCourseList
                  remainingCourses={remainingCourses}
                  selectedCourses={selectedCourses}
                  onAddAllCourses={onAddAllCourses}
                  onAddCourse={onAddCourse}
                />
              )}
            </div>
          </CollapsibleSection>
        )}

        {remainingCourses.length === 0 && (
          <div style={{ 
            padding: '16px',
            background: '#f0fdf4',
            borderRadius: '8px',
            fontSize: '14px',
            color: '#166534'
          }}>
            All degree requirements completed or in progress
          </div>
        )}
      </div>
    </div>
  );
}

function ProgressStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div style={{ fontSize: '24px', fontWeight: 600, color: '#111', lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
        {label}
      </div>
    </div>
  );
}

function CollapsibleSection({
  title,
  count,
  open,
  onToggle,
  loading,
  children,
}: {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  loading?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between py-2 text-left"
      >
        <span style={{ fontSize: '14px', fontWeight: 500, color: '#334155' }}>
          {title}
          <span style={{ color: '#94a3b8', fontWeight: 400, marginLeft: '8px' }}>
            {count}
          </span>
          {loading && (
            <span style={{ color: '#94a3b8', fontWeight: 400, marginLeft: '8px', fontStyle: 'italic' }}>
              Loading...
            </span>
          )}
        </span>
        <ChevronDown 
          className="w-4 h-4 text-slate-400 transition-transform"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
      </button>
      {open && (
        <div style={{ paddingTop: '12px', paddingBottom: '8px' }}>
          {children}
        </div>
      )}
    </div>
  );
}

interface RemainingCoreCourseListProps {
  coreCourses: string[];
  selectedCourses: string[];
  courseDetails: Map<string, Course>;
  currentTerm: string;
  onAddCourse: (courseCode: string) => void | Promise<void>;
  onRemoveCourse: (courseCode: string) => void;
  areAllPrerequisitesMet: (courseCode: string) => boolean;
  getMissingPrerequisites: (courseCode: string) => string[];
  getTermLabel: (term: string) => string;
  getTermShortLabel: (term: string) => string;
}

function RemainingCoreCourseList({
  coreCourses,
  selectedCourses,
  courseDetails,
  currentTerm,
  onAddCourse,
  onRemoveCourse,
  areAllPrerequisitesMet,
  getMissingPrerequisites,
  getTermLabel,
  getTermShortLabel,
}: RemainingCoreCourseListProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {coreCourses.map((code) => {
        const details = courseDetails.get(code);
        const hasTermData = details?.terms && details.terms.length > 0;
        const isOfferedNow = hasTermData && details!.terms!.includes(currentTerm);
        const prereqsMet = isOfferedNow && areAllPrerequisitesMet(code);
        const isSelected = selectedCourses.includes(code);
        const canAdd = isOfferedNow && !isSelected;
        const isClickable = canAdd || isSelected;

        const courseChip = (
          <button
            onClick={() => {
              if (isSelected) onRemoveCourse(code);
              else if (canAdd) onAddCourse(code);
            }}
            disabled={!isClickable}
            style={{
              padding: '6px 12px',
              fontSize: '13px',
              fontWeight: 500,
              borderRadius: '6px',
              border: '1px solid',
              transition: 'all 150ms',
              cursor: isClickable ? 'pointer' : 'default',
              background: isSelected ? '#fef2f2' : canAdd ? '#fff' : '#fafafa',
              color: isSelected ? '#991b1b' : canAdd ? '#111' : '#94a3b8',
              borderColor: isSelected ? '#fecaca' : canAdd ? '#e2e8f0' : '#f1f5f9',
              opacity: !isClickable ? 0.7 : 1,
            }}
          >
            {code}
            {isSelected && (
              <X className="w-3 h-3 inline ml-1.5" style={{ marginTop: '-1px' }} />
            )}
          </button>
        );

        if (isClickable) {
          return <span key={code}>{courseChip}</span>;
        }

        // Non-clickable courses get a hover card explaining why
        const missingPrereqs = getMissingPrerequisites(code);

        let reason = 'No schedule data available';
        if (hasTermData && !isOfferedNow) {
          reason = `Not offered in ${getTermLabel(currentTerm)}`;
        } else if (!prereqsMet && missingPrereqs.length > 0) {
          reason = `Missing: ${missingPrereqs.join(', ')}`;
        }

        return (
          <HoverCard key={code} openDelay={200} closeDelay={100}>
            <HoverCardTrigger asChild>{courseChip}</HoverCardTrigger>
            <HoverCardContent
              side="top"
              align="center"
              style={{
                width: '240px',
                padding: '12px',
                background: '#fff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
              }}
            >
              <p style={{ fontSize: '13px', fontWeight: 500, color: '#111', marginBottom: '4px' }}>
                {code}
              </p>
              <p style={{ fontSize: '12px', color: '#64748b' }}>
                {reason}
              </p>
              {hasTermData && !isOfferedNow && details!.terms!.length > 0 && (
                <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '8px' }}>
                  Available: {details!.terms!.map(t => getTermShortLabel(t)).join(', ')}
                </p>
              )}
            </HoverCardContent>
          </HoverCard>
        );
      })}
    </div>
  );
}

function ElectiveRequirementList({
  electiveRequirements,
  selectedCourses,
  onAddCourse,
}: {
  electiveRequirements: ElectiveRequirement[];
  selectedCourses: string[];
  onAddCourse: (courseCode: string) => void | Promise<void>;
}) {
  return (
    <div className="space-y-2">
      {electiveRequirements.map((elective) => {
        const selectedCount = getSelectedElectiveTokenCount(selectedCourses, elective.category);
        const slotCount = getElectiveSlotCount(elective);
        const nextTokenNumber = getMissingElectiveTokenNumbers(selectedCourses, elective.category, slotCount)[0];
        const nextToken = nextTokenNumber ? buildElectiveToken(elective.category, nextTokenNumber) : '';
        const isFullySelected = selectedCount >= slotCount;

        return (
          <button
            key={elective.category}
            onClick={() => !isFullySelected && onAddCourse(nextToken)}
            disabled={isFullySelected}
            className="w-full text-left"
            style={{
              padding: '12px 16px',
              background: isFullySelected ? '#f8fafc' : '#fff',
              border: '1px solid',
              borderColor: isFullySelected ? '#f1f5f9' : '#e2e8f0',
              borderRadius: '8px',
              cursor: isFullySelected ? 'default' : 'pointer',
              opacity: isFullySelected ? 0.7 : 1,
              transition: 'all 150ms',
            }}
          >
            <div className="flex items-center justify-between">
              <div>
                <p style={{ fontSize: '14px', fontWeight: 500, color: '#111' }}>
                  {elective.label}
                </p>
                <p style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                  {elective.creditsNeeded} credits needed
                </p>
              </div>
              <span style={{ 
                fontSize: '13px', 
                color: isFullySelected ? '#10b981' : '#64748b',
                fontWeight: 500
              }}>
                {selectedCount}/{slotCount}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function FallbackRemainingCourseList({
  remainingCourses,
  selectedCourses,
  onAddAllCourses,
  onAddCourse,
}: {
  remainingCourses: string[];
  selectedCourses: string[];
  onAddAllCourses: (courseCodes: string[]) => void | Promise<void>;
  onAddCourse: (courseCode: string) => void | Promise<void>;
}) {
  return (
    <div>
      {remainingCourses.some(code => !selectedCourses.includes(code)) && (
        <button
          onClick={() => onAddAllCourses(remainingCourses)}
          style={{
            fontSize: '13px',
            fontWeight: 500,
            color: '#bf112b',
            marginBottom: '12px',
          }}
          className="hover:underline"
        >
          Add all remaining courses
        </button>
      )}
      <div className="flex flex-wrap gap-2">
        {remainingCourses.map((code) => {
          const isSelected = selectedCourses.includes(code);
          return (
            <button
              key={code}
              onClick={() => !isSelected && onAddCourse(code)}
              disabled={isSelected}
              style={{
                padding: '6px 12px',
                fontSize: '13px',
                fontWeight: 500,
                borderRadius: '6px',
                border: '1px solid',
                background: isSelected ? '#f8fafc' : '#fff',
                color: isSelected ? '#94a3b8' : '#111',
                borderColor: isSelected ? '#f1f5f9' : '#e2e8f0',
                cursor: isSelected ? 'default' : 'pointer',
                opacity: isSelected ? 0.7 : 1,
              }}
            >
              {code}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface SearchPanelProps {
  searchRef: RefObject<HTMLDivElement | null>;
  searchQuery: string;
  searchResults: Course[];
  showResults: boolean;
  isSearching: boolean;
  selectedCourses: string[];
  currentTerm: string;
  onSearch: (query: string) => void;
  onFocus: () => void;
  onAddCourse: (courseCode: string) => void | Promise<void>;
  getTermLabel: (term: string) => string;
}

export function SearchPanel({
  searchRef,
  searchQuery,
  searchResults,
  showResults,
  isSearching,
  selectedCourses,
  currentTerm,
  onSearch,
  onFocus,
  onAddCourse,
  getTermLabel,
}: SearchPanelProps) {
  const sortedResults = [...searchResults].sort((a, b) => {
    const aInTerm = a.terms?.includes(currentTerm) ? 1 : 0;
    const bInTerm = b.terms?.includes(currentTerm) ? 1 : 0;
    return bInTerm - aInTerm;
  });

  return (
    <div 
      style={{ 
        background: '#fff', 
        borderRadius: '12px', 
        border: '1px solid #e2e8f0',
        padding: '20px'
      }}
    >
      <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#111', marginBottom: '16px' }}>
        Search Courses
      </h3>
      <div ref={searchRef} className="relative">
        <div className="relative">
          <Search 
            className="absolute w-4 h-4 text-slate-400" 
            style={{ left: '14px', top: '50%', transform: 'translateY(-50%)' }} 
          />
          <Input
            type="text"
            placeholder="Course code or name..."
            value={searchQuery}
            onChange={(e) => onSearch(e.target.value)}
            onFocus={onFocus}
            style={{ 
              paddingLeft: '42px',
              height: '44px',
              fontSize: '14px',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              background: '#f8fafc'
            }}
          />
          {isSearching && (
            <div 
              className="absolute w-4 h-4 border-2 border-slate-200 rounded-full"
              style={{ 
                right: '14px', 
                top: '50%', 
                transform: 'translateY(-50%)',
                borderTopColor: '#64748b',
                animation: 'spin 1s linear infinite'
              }}
            />
          )}
        </div>

        {showResults && searchResults.length > 0 && (
          <div 
            className="absolute w-full mt-2 overflow-y-auto"
            style={{ 
              zIndex: 20, 
              maxHeight: '320px',
              background: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.08)'
            }}
          >
            {sortedResults.map((course, index) => {
              const isSelected = selectedCourses.includes(course.code);
              const isAvailable = course.terms?.includes(currentTerm);
              
              return (
                <button
                  key={course.code}
                  onClick={() => onAddCourse(course.code)}
                  disabled={isSelected}
                  className="w-full text-left transition-colors"
                  style={{ 
                    padding: '14px 16px',
                    borderBottom: index < sortedResults.length - 1 ? '1px solid #f1f5f9' : 'none',
                    opacity: isSelected ? 0.5 : 1, 
                    cursor: isSelected ? 'not-allowed' : 'pointer',
                    background: 'transparent'
                  }}
                  onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = '#f8fafc'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span style={{ fontSize: '14px', fontWeight: 600, color: '#111' }}>
                          {course.code}
                        </span>
                        {isAvailable && (
                          <span style={{ 
                            fontSize: '11px', 
                            fontWeight: 500,
                            color: '#059669',
                            background: '#ecfdf5',
                            padding: '2px 6px',
                            borderRadius: '4px'
                          }}>
                            Available
                          </span>
                        )}
                      </div>
                      {course.name && course.name !== course.code && (
                        <p style={{ 
                          fontSize: '13px', 
                          color: '#64748b', 
                          marginTop: '2px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {course.name}
                        </p>
                      )}
                      <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                        {course.credits} credits
                      </p>
                    </div>
                    {isSelected && (
                      <span style={{ fontSize: '12px', color: '#94a3b8', flexShrink: 0 }}>
                        Added
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {showResults && searchQuery && searchResults.length === 0 && !isSearching && (
          <div 
            className="absolute w-full mt-2 text-center"
            style={{ 
              zIndex: 20, 
              padding: '24px',
              background: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.08)'
            }}
          >
            <p style={{ fontSize: '14px', color: '#64748b' }}>
              No courses found for "{searchQuery}"
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export function ManualElectivePicker({
  electiveRequirements,
  selectedCourses,
  onAddElectiveCategory,
}: {
  electiveRequirements: ElectiveRequirement[];
  selectedCourses: string[];
  onAddElectiveCategory: (category: string) => void;
}) {
  if (electiveRequirements.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        background: '#fff',
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        padding: '20px'
      }}
    >
      <div style={{ marginBottom: '16px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#111', marginBottom: '4px' }}>
          Add Electives
        </h3>
        <p style={{ fontSize: '13px', color: '#64748b', lineHeight: 1.5 }}>
          Add elective categories manually even if your audit does not list them.
        </p>
      </div>

      <div className="space-y-2">
        {electiveRequirements.map((elective) => {
          const selectedCount = getSelectedElectiveTokenCount(selectedCourses, elective.category);
          return (
            <button
              key={elective.category}
              onClick={() => onAddElectiveCategory(elective.category)}
              className="w-full text-left"
              style={{
                padding: '12px 16px',
                background: '#fff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 150ms',
              }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p style={{ fontSize: '14px', fontWeight: 500, color: '#111' }}>
                    {elective.label}
                  </p>
                  <p style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                    {elective.selectionUnitCredits || 0.5} credits per selection
                  </p>
                </div>
                <span style={{
                  fontSize: '13px',
                  color: '#64748b',
                  fontWeight: 500
                }}>
                  {selectedCount} selected
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface SelectedCoursesPanelProps {
  selectedCourses: string[];
  completedCourses: string[];
  courseDetails: Map<string, Course>;
  electiveRequirements: ElectiveRequirement[];
  hasAuditData: boolean;
  onRemoveCourse: (courseCode: string) => void;
  areAllPrerequisitesMet: (courseCode: string) => boolean;
  prerequisiteValidation: Record<string, PrerequisiteValidationResult>;
}

export function SelectedCoursesPanel({
  selectedCourses,
  completedCourses,
  courseDetails,
  electiveRequirements,
  hasAuditData,
  onRemoveCourse,
  areAllPrerequisitesMet,
  prerequisiteValidation,
}: SelectedCoursesPanelProps) {
  return (
    <div 
      style={{ 
        background: '#fff', 
        borderRadius: '12px', 
        border: '1px solid #e2e8f0',
        padding: '20px'
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#111' }}>
          Selected Courses
        </h3>
        {selectedCourses.length > 0 && (
          <span style={{ 
            fontSize: '13px', 
            fontWeight: 500,
            color: '#64748b',
            background: '#f1f5f9',
            padding: '4px 10px',
            borderRadius: '12px'
          }}>
            {selectedCourses.length}
          </span>
        )}
      </div>

      {selectedCourses.length === 0 ? (
        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
          <p style={{ fontSize: '14px', color: '#64748b' }}>
            No courses selected
          </p>
          <p style={{ fontSize: '13px', color: '#94a3b8', marginTop: '4px' }}>
            Search or add from your requirements
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {selectedCourses.map((courseCode) => {
            if (courseCode.startsWith('ELECTIVE:')) {
              const category = getElectiveTokenCategory(courseCode) || courseCode.replace('ELECTIVE:', '');
              const requirement = electiveRequirements.find(er => er.category === category);
              const label = requirement?.label || category;
              const creditInfo = requirement ? getSelectionUnitCredits(requirement) : 0;

              return (
                <div
                  key={courseCode}
                  style={{
                    padding: '14px 16px',
                    background: '#fafafa',
                    borderRadius: '8px',
                    border: '1px solid #f1f5f9'
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p style={{ fontSize: '14px', fontWeight: 500, color: '#111' }}>
                        {label}
                      </p>
                      <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                        {creditInfo} credits &middot; Auto-selected
                      </p>
                    </div>
                    <button
                      onClick={() => onRemoveCourse(courseCode)}
                      className="p-1.5 rounded-md hover:bg-slate-100 transition-colors"
                    >
                      <X className="w-4 h-4 text-slate-400" />
                    </button>
                  </div>
                </div>
              );
            }

            const course = courseDetails.get(courseCode);
            if (!course) return null;

            const isCompleted = completedCourses.includes(courseCode);
            const validation = prerequisiteValidation[courseCode];
            const hasUnmetPrereqs = isCompleted ? false : !areAllPrerequisitesMet(courseCode);
            const noSections = course.hasSections === false;
            const prerequisiteExpression = validation?.expressionEvaluated?.trim() || course.prerequisiteExpression?.trim();
            const prerequisiteSummary = prerequisiteExpression || course.prerequisites.join(', ');

            // Determine if there's a warning
            const hasWarning = noSections || (hasUnmetPrereqs && hasAuditData) || isCompleted;
            let warningText = '';
            if (isCompleted) warningText = 'Already completed';
            else if (noSections) warningText = 'No sections available';
            else if (hasUnmetPrereqs && hasAuditData) warningText = 'Prerequisites not met';

            return (
              <div
                key={courseCode}
                style={{
                  padding: '14px 16px',
                  background: '#fff',
                  borderRadius: '8px',
                  border: '1px solid',
                  borderColor: hasWarning ? '#fef3c7' : '#e2e8f0'
                }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span style={{ fontSize: '14px', fontWeight: 600, color: '#111' }}>
                        {course.code}
                      </span>
                      {hasWarning && (
                        <span style={{ 
                          fontSize: '11px', 
                          fontWeight: 500,
                          color: '#92400e',
                          background: '#fef3c7',
                          padding: '2px 6px',
                          borderRadius: '4px'
                        }}>
                          {warningText}
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: '13px', color: '#64748b', marginTop: '2px' }}>
                      {course.name}
                    </p>

                    {!isCompleted && prerequisiteSummary && (
                      <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #f1f5f9' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                            Prerequisite Logic:
                          </span>
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 600,
                              color: hasUnmetPrereqs ? '#b91c1c' : '#047857',
                              background: hasUnmetPrereqs ? '#fef2f2' : '#ecfdf5',
                              padding: '2px 6px',
                              borderRadius: '9999px'
                            }}
                          >
                            {hasUnmetPrereqs ? 'Not met' : 'Met'}
                          </span>
                        </div>
                        <p
                          style={{
                            fontSize: '12px',
                            color: hasUnmetPrereqs ? '#dc2626' : '#059669',
                            marginTop: '6px',
                            fontFamily: 'monospace',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word'
                          }}
                        >
                          {prerequisiteSummary}
                        </p>
                        {!prerequisiteExpression && course.prerequisites.length > 0 && (
                          <div style={{ marginTop: '6px' }}>
                            {course.prerequisites.map((prereq, index) => {
                              const status = completedCourses.includes(prereq) ? 'met' : 'not-met';
                              return (
                                <span key={prereq}>
                                  <span
                                    style={{
                                      fontSize: '12px',
                                      fontWeight: 500,
                                      color: status === 'met' ? '#059669' : status === 'not-met' ? '#dc2626' : '#64748b',
                                    }}
                                  >
                                    {prereq}
                                  </span>
                                  {index < course.prerequisites.length - 1 && (
                                    <span style={{ color: '#94a3b8' }}>, </span>
                                  )}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => onRemoveCourse(courseCode)}
                    className="p-1.5 rounded-md hover:bg-slate-100 transition-colors ml-3"
                  >
                    <X className="w-4 h-4 text-slate-400" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface GenerateScheduleSidebarProps {
  selectedCourses: string[];
  coursesWithSectionsCount: number;
  currentTerm: string;
  hasAuditData: boolean;
  onGenerateSchedules: () => void;
  getTermLabel: (term: string) => string;
}

export function GenerateScheduleSidebar({
  selectedCourses,
  coursesWithSectionsCount,
  currentTerm,
  hasAuditData,
  onGenerateSchedules,
  getTermLabel,
}: GenerateScheduleSidebarProps) {
  const canGenerate = selectedCourses.length > 0;
  
  return (
    <div className="space-y-4">
      <div 
        style={{ 
          background: '#fff', 
          borderRadius: '12px', 
          border: '1px solid #e2e8f0',
          padding: '20px',
          position: 'sticky',
          top: '24px'
        }}
      >
        <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#111', marginBottom: '8px' }}>
          Generate Schedule
        </h3>
        <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px', lineHeight: 1.5 }}>
          {selectedCourses.length === 0
            ? 'Select courses to get started'
            : `${coursesWithSectionsCount} course${coursesWithSectionsCount !== 1 ? 's' : ''} ready for ${getTermLabel(currentTerm)}`
          }
        </p>
        <Button
          onClick={onGenerateSchedules}
          disabled={!canGenerate}
          className="w-full"
          style={{ height: '44px', fontSize: '14px' }}
        >
          Generate Schedules
        </Button>
      </div>

      {!hasAuditData && (
        <div 
          style={{ 
            padding: '16px',
            background: '#f8fafc',
            borderRadius: '10px',
            border: '1px solid #e2e8f0'
          }}
        >
          <p style={{ fontSize: '13px', color: '#64748b', lineHeight: 1.5 }}>
            Upload your Academic Audit on the previous page to see prerequisite validation and degree requirements.
          </p>
        </div>
      )}
    </div>
  );
}
