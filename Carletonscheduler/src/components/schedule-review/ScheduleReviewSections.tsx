import type { Dispatch, SetStateAction } from 'react';
import { Check, ChevronDown, ChevronLeft, ChevronRight, Copy, Loader2, Search } from 'lucide-react';
import { COURSE_COLORS, TIMETABLE_CONFIG } from '../../config/constants';
import { type GeneratedSchedule } from '../../utils/scheduleGenerator';

interface ElectiveCourseInfo {
  code: string;
  name: string;
  credits: number;
  status: 'available' | 'tba' | 'conflicting' | 'prereq';
  prerequisites: string[];
}

export function ElectiveCourseCard({
  elective,
  category,
  isSelected,
  isSwapping,
  onToggle,
}: {
  elective: ElectiveCourseInfo;
  category: string;
  isSelected: boolean;
  isSwapping: boolean;
  onToggle: (category: string, code: string, credits: number) => void;
}) {
  const isAvailable = elective.status !== 'conflicting';
  const statusLabel = elective.status === 'conflicting'
    ? 'Conflicts with current schedule'
    : elective.status === 'prereq'
      ? 'Prereqs not met'
      : elective.status === 'tba'
        ? 'Timing TBA'
      : null;

  return (
    <button
      onClick={() => isAvailable && onToggle(category, elective.code, elective.credits)}
      disabled={!isAvailable || isSwapping}
      style={{
        textAlign: 'left',
        padding: '10px 12px',
        borderRadius: '8px',
        border: isSelected ? '2px solid #374151' : isAvailable ? '1px solid #e5e7eb' : '1px solid #f3f4f6',
        background: isSelected ? '#f3f4f6' : isAvailable ? '#fff' : '#f9fafb',
        opacity: isAvailable ? 1 : 0.5,
        cursor: isAvailable ? 'pointer' : 'not-allowed',
        width: '100%',
        transition: 'all 0.15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: '6px' }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: '13px', fontWeight: 700, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3, margin: 0 }}>
            {elective.code}
          </p>
          <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {elective.name}
          </p>
          <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>{elective.credits} cr</p>
        </div>
        {isSelected && (
          <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Check style={{ width: '12px', height: '12px', color: '#fff' }} />
          </div>
        )}
        {isSwapping && <Loader2 style={{ width: '16px', height: '16px', color: '#6b7280', flexShrink: 0 }} className="animate-spin" />}
      </div>
      {statusLabel && (
        <p style={{ marginTop: '4px', fontSize: '11px', color: '#9ca3af', margin: '4px 0 0 0' }}>
          {statusLabel}
        </p>
      )}
    </button>
  );
}

export function ScheduleCalendarSection({
  schedules,
  currentIndex,
  currentSchedule,
  visibleTimeSlots,
  hourPx,
  getPos,
  onBack,
  onPrevious,
  onNext,
}: {
  schedules: GeneratedSchedule[];
  currentIndex: number;
  currentSchedule: GeneratedSchedule;
  visibleTimeSlots: string[];
  hourPx: number;
  getPos: (startTime: string, endTime: string) => { top: number; height: number };
  onBack: () => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const groupedCourses = new Map<string, typeof currentSchedule.selections>();
  currentSchedule.selections.forEach(selection => {
    if (!groupedCourses.has(selection.courseCode)) groupedCourses.set(selection.courseCode, []);
    groupedCourses.get(selection.courseCode)!.push(selection);
  });

  const courseColorMap = new Map<string, typeof COURSE_COLORS[number]>();
  Array.from(groupedCourses.keys()).forEach((code, idx) => {
    courseColorMap.set(code, COURSE_COLORS[idx % COURSE_COLORS.length]);
  });

  return (
    <div style={{ overflow: 'auto', padding: '20px' }}>
      <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '15px', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '16px', padding: 0 }}>
        <ChevronLeft style={{ width: '16px', height: '16px' }} /> Back to selection
      </button>

      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div style={{ minWidth: '480px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '50px repeat(5, 1fr)', gap: '2px', marginBottom: '2px' }}>
            <div />
            {TIMETABLE_CONFIG.DAYS.map(day => (
              <div key={day} style={{ fontSize: '13px', fontWeight: 600, color: '#374151', padding: '8px 0', textAlign: 'center', background: '#f9fafb', borderRadius: '4px' }}>
                {day.slice(0, 3)}
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '50px repeat(5, 1fr)', gap: '2px' }}>
            <div>
              {visibleTimeSlots.map(time => (
                <div key={time} style={{ height: `${hourPx}px`, fontSize: '12px', color: '#9ca3af', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', paddingTop: '2px', paddingRight: '8px' }}>
                  {time}
                </div>
              ))}
            </div>

            {TIMETABLE_CONFIG.DAYS.map(day => (
              <div key={day} style={{ position: 'relative', background: '#fafafa', borderRadius: '4px', height: `${visibleTimeSlots.length * hourPx}px` }}>
                {visibleTimeSlots.map((_, idx) => (
                  <div key={idx} style={{ position: 'absolute', left: 0, right: 0, top: `${idx * hourPx}px`, borderTop: '1px solid #f3f4f6' }} />
                ))}

                {currentSchedule.selections.map(selection => {
                  const colors = courseColorMap.get(selection.courseCode) || COURSE_COLORS[0];
                  return selection.section.timeSlots
                    .filter(slot => slot.day === day)
                    .map((slot, slotIdx) => {
                      const { top, height } = getPos(slot.startTime, slot.endTime);
                      return (
                        <div
                          key={`${selection.courseCode}-${selection.section.sectionCode}-${slotIdx}`}
                          style={{
                            position: 'absolute',
                            left: '2px',
                            right: '2px',
                            top: `${top}px`,
                            height: `${height}px`,
                            background: colors.bg,
                            border: `1px solid ${colors.border}`,
                            color: colors.text,
                            borderRadius: '4px',
                            padding: '3px 6px',
                            overflow: 'hidden',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'center',
                          }}
                        >
                          <p style={{ fontSize: '12px', fontWeight: 700, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
                            {selection.courseCode}
                          </p>
                          <p style={{ fontSize: '11px', opacity: 0.7, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
                            {selection.section.sectionCode} · {slot.startTime}-{slot.endTime}
                          </p>
                        </div>
                      );
                    });
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginTop: '16px' }}>
        <button onClick={onPrevious} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', cursor: 'pointer', padding: '6px 10px', display: 'flex', alignItems: 'center' }}>
          <ChevronLeft style={{ width: '18px', height: '18px', color: '#374151' }} />
        </button>
        <span style={{ fontSize: '15px', fontWeight: 500, color: '#374151', minWidth: '120px', textAlign: 'center' }}>
          Schedule {currentIndex + 1} of {schedules.length}
        </span>
        <button onClick={onNext} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', cursor: 'pointer', padding: '6px 10px', display: 'flex', alignItems: 'center' }}>
          <ChevronRight style={{ width: '18px', height: '18px', color: '#374151' }} />
        </button>
      </div>
    </div>
  );
}

export function ScheduleSidebar({
  currentSchedule,
  copiedItem,
  onCopyToClipboard,
  activeElectiveRequirements,
  activeElectiveCategory,
  setActiveElectiveCategory,
  selectedElectives,
  selectedElectiveCredits,
  electiveCourseDetails,
  loadingElectives,
  electiveSearchTerms,
  setElectiveSearchTerms,
  showUnavailable,
  setShowUnavailable,
  swappingElective,
  onElectiveToggle,
  onElectiveRemove,
}: {
  currentSchedule: GeneratedSchedule;
  copiedItem: string | null;
  onCopyToClipboard: (text: string, itemId: string) => void;
  activeElectiveRequirements: Array<{ category: string; label: string; creditsNeeded: number }>;
  activeElectiveCategory: string;
  setActiveElectiveCategory: (category: string) => void;
  selectedElectives: Record<string, string[]>;
  selectedElectiveCredits: Record<string, number>;
  electiveCourseDetails: Record<string, ElectiveCourseInfo[]>;
  loadingElectives: Record<string, boolean>;
  electiveSearchTerms: Record<string, string>;
  setElectiveSearchTerms: Dispatch<SetStateAction<Record<string, string>>>;
  showUnavailable: Record<string, boolean>;
  setShowUnavailable: Dispatch<SetStateAction<Record<string, boolean>>>;
  swappingElective: string | null;
  onElectiveToggle: (category: string, code: string, credits: number) => void;
  onElectiveRemove: (category: string, courseCode: string) => void;
}) {
  const groupedCourses = new Map<string, typeof currentSchedule.selections>();
  currentSchedule.selections.forEach(selection => {
    if (!groupedCourses.has(selection.courseCode)) groupedCourses.set(selection.courseCode, []);
    groupedCourses.get(selection.courseCode)!.push(selection);
  });

  const courseColorMap = new Map<string, typeof COURSE_COLORS[number]>();
  Array.from(groupedCourses.keys()).forEach((code, idx) => {
    courseColorMap.set(code, COURSE_COLORS[idx % COURSE_COLORS.length]);
  });

  const activeEr = activeElectiveRequirements.find(er => er.category === activeElectiveCategory) || activeElectiveRequirements[0];
  const category = activeEr?.category || '';
  const currentPicks = selectedElectives[category] || [];
  const allDetails = electiveCourseDetails[category] || [];
  const isLoading = loadingElectives[category];
  const searchTerm = electiveSearchTerms[category] || '';
  const available = allDetails.filter(e => e.status === 'available');
  const tba = allDetails.filter(e => e.status === 'tba');
  const conflicting = allDetails.filter(e => e.status === 'conflicting');
  const prereqNotMet = allDetails.filter(e => e.status === 'prereq');
  const filterFn = (e: ElectiveCourseInfo) => {
    if (!searchTerm) return true;
    const t = searchTerm.toLowerCase();
    return e.code.toLowerCase().includes(t) || e.name.toLowerCase().includes(t);
  };
  const filteredAvail = available.filter(filterFn);
  const filteredTba = tba.filter(filterFn);
  const filteredConflicting = conflicting.filter(filterFn);
  const filteredPrereqNotMet = prereqNotMet.filter(filterFn);
  const creditsTarget = selectedElectiveCredits[category] || activeEr?.creditsNeeded || 0;
  const selectedCredits = allDetails.filter(e => currentPicks.includes(e.code)).reduce((s, e) => s + e.credits, 0);
  const progress = creditsTarget > 0 ? Math.min((selectedCredits / creditsTarget) * 100, 100) : 0;
  const isFulfilled = creditsTarget > 0 && selectedCredits >= creditsTarget;

  return (
    <div style={{ borderLeft: '1px solid #e5e7eb', background: '#fff', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '16px', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ marginBottom: '12px' }}>
          <span style={{ fontSize: '15px', fontWeight: 600, color: '#111827' }}>
            Courses ({groupedCourses.size})
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {Array.from(groupedCourses.entries()).map(([courseCode, sections]) => {
            const colors = courseColorMap.get(courseCode) || COURSE_COLORS[0];
            const prerequisiteInfo = currentSchedule.prerequisiteInfo?.[courseCode];
            const hasUnmetPrerequisites = Boolean(
              prerequisiteInfo &&
              prerequisiteInfo.isValid === false &&
              prerequisiteInfo.expressionEvaluated &&
              prerequisiteInfo.expressionEvaluated !== 'None'
            );

            return sections.map((selection) => {
              const itemId = `${courseCode}-${selection.section.sectionCode}`;
              const days = selection.section.timeSlots
                .map(slot => slot.day.slice(0, 3))
                .filter((value, index, array) => array.indexOf(value) === index)
                .join(', ');
              const times = selection.section.timeSlots.length > 0
                ? `${selection.section.timeSlots[0].startTime}-${selection.section.timeSlots[0].endTime}`
                : 'TBA';

              return (
                <div key={itemId} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '6px', cursor: 'default' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: colors.border, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#111827' }}>{courseCode}</span>
                      <span style={{ fontSize: '11px', color: '#9ca3af' }}>{selection.section.type}</span>
                    </div>
                    <p style={{ fontSize: '11px', color: '#9ca3af', margin: 0 }}>{days} {times}</p>
                    {hasUnmetPrerequisites && (
                      <p
                        style={{
                          fontSize: '11px',
                          color: '#dc2626',
                          margin: '4px 0 0 0',
                          fontFamily: 'monospace',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word'
                        }}
                      >
                        {prerequisiteInfo?.expressionEvaluated}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => onCopyToClipboard(selection.section.crn, `crn-${itemId}`)}
                    style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontFamily: 'monospace', color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}
                  >
                    {copiedItem === `crn-${itemId}` ? (
                      <Check style={{ width: '12px', height: '12px', color: '#16a34a' }} />
                    ) : (
                      <Copy style={{ width: '10px', height: '10px', opacity: 0.4 }} />
                    )}
                    <span>{selection.section.crn}</span>
                  </button>
                </div>
              );
            });
          })}
        </div>
      </div>

      {activeElectiveRequirements.length > 0 && activeEr && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: '16px 16px 0 16px' }}>
            <span style={{ fontSize: '15px', fontWeight: 600, color: '#111827' }}>Electives</span>
          </div>

          {activeElectiveRequirements.length > 1 ? (
            <div style={{ padding: '10px 16px 0 16px' }}>
              <select
                value={activeElectiveCategory || activeElectiveRequirements[0].category}
                onChange={e => setActiveElectiveCategory(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', fontSize: '13px', border: '1px solid #e5e7eb', borderRadius: '6px', outline: 'none', background: '#f9fafb', color: '#111827', cursor: 'pointer' }}
              >
                {activeElectiveRequirements.map(er => {
                  const picks = selectedElectives[er.category] || [];
                  const catDetails = electiveCourseDetails[er.category] || [];
                  const credits = catDetails.filter(e => picks.includes(e.code)).reduce((s, e) => s + e.credits, 0);
                  const target = selectedElectiveCredits[er.category] || er.creditsNeeded;
                  return (
                    <option key={er.category} value={er.category}>
                      {er.label} ({credits}/{target} cr)
                    </option>
                  );
                })}
              </select>
            </div>
          ) : (
            <div style={{ padding: '6px 16px 0 16px' }}>
              <p style={{ fontSize: '13px', color: '#4b5563', margin: 0 }}>{activeEr.label}</p>
            </div>
          )}

          <div style={{ padding: '10px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <div style={{ flex: 1, background: '#e5e7eb', borderRadius: '9999px', height: '6px' }}>
                <div style={{ width: `${progress}%`, height: '6px', borderRadius: '9999px', background: isFulfilled ? '#374151' : '#9ca3af', transition: 'width 0.3s' }} />
              </div>
              <span style={{ fontSize: '12px', fontWeight: 600, color: isFulfilled ? '#374151' : '#6b7280' }}>
                {selectedCredits}/{creditsTarget} cr
              </span>
            </div>
            {currentPicks.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                {currentPicks.map(code => (
                  <span
                    key={code}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '2px 8px 2px 10px', fontSize: '12px', fontWeight: 600, background: '#f3f4f6', color: '#374151', borderRadius: '9999px' }}
                  >
                    {code}
                    <button
                      onClick={(e) => { e.stopPropagation(); onElectiveRemove(category, code); }}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '16px', height: '16px', borderRadius: '50%', background: '#e5e7eb', border: 'none', cursor: 'pointer', color: '#374151', fontSize: '10px', lineHeight: 1, padding: 0 }}
                      title={`Remove ${code}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div style={{ padding: '0 16px 8px 16px', position: 'relative' }}>
            <Search style={{ position: 'absolute', left: '26px', top: '50%', transform: 'translateY(-50%)', width: '14px', height: '14px', color: '#9ca3af' }} />
            <input
              placeholder="Filter by code or name..."
              value={searchTerm}
              onChange={e => setElectiveSearchTerms(prev => ({ ...prev, [category]: e.target.value }))}
              style={{ width: '100%', padding: '8px 12px 8px 34px', fontSize: '13px', border: '1px solid #e5e7eb', borderRadius: '6px', outline: 'none', background: '#f9fafb', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px 16px' }}>
            {isLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center', padding: '32px 0', color: '#9ca3af' }}>
                <Loader2 style={{ width: '16px', height: '16px' }} className="animate-spin" />
                <span style={{ fontSize: '12px' }}>Loading...</span>
              </div>
            ) : (
              <>
                {filteredAvail.length > 0 && (
                  <div style={{ marginBottom: '12px' }}>
                    <p style={{ fontSize: '12px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                      Available ({filteredAvail.length})
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '6px' }}>
                      {filteredAvail.map(elective => (
                        <ElectiveCourseCard
                          key={elective.code}
                          elective={elective}
                          category={category}
                          isSelected={currentPicks.includes(elective.code)}
                          isSwapping={swappingElective === elective.code}
                          onToggle={onElectiveToggle}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {filteredTba.length > 0 && (
                  <div style={{ marginBottom: '12px' }}>
                    <p style={{ fontSize: '12px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                      TBA ({filteredTba.length})
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '6px' }}>
                      {filteredTba.map(elective => (
                        <ElectiveCourseCard
                          key={elective.code}
                          elective={elective}
                          category={category}
                          isSelected={currentPicks.includes(elective.code)}
                          isSwapping={swappingElective === elective.code}
                          onToggle={onElectiveToggle}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {filteredConflicting.length > 0 && (
                  <div>
                    <button
                      onClick={() => setShowUnavailable(prev => ({ ...prev, [`${category}:conflicting`]: !prev[`${category}:conflicting`] }))}
                      style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 600, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', marginBottom: '6px', padding: 0 }}
                    >
                      <ChevronDown style={{ width: '12px', height: '12px', transform: showUnavailable[`${category}:conflicting`] ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                      Conflicting ({filteredConflicting.length})
                    </button>
                    {showUnavailable[`${category}:conflicting`] && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '6px' }}>
                        {filteredConflicting.map(elective => (
                          <ElectiveCourseCard
                            key={elective.code}
                            elective={elective}
                            category={category}
                            isSelected={false}
                            isSwapping={false}
                            onToggle={onElectiveToggle}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {filteredPrereqNotMet.length > 0 && (
                  <div>
                    <button
                      onClick={() => setShowUnavailable(prev => ({ ...prev, [`${category}:prereq`]: !prev[`${category}:prereq`] }))}
                      style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 600, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', marginBottom: '6px', padding: 0 }}
                    >
                      <ChevronDown style={{ width: '12px', height: '12px', transform: showUnavailable[`${category}:prereq`] ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                      Prereq not met ({filteredPrereqNotMet.length})
                    </button>
                    {showUnavailable[`${category}:prereq`] && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '6px' }}>
                        {filteredPrereqNotMet.map(elective => (
                          <ElectiveCourseCard
                            key={elective.code}
                            elective={elective}
                            category={category}
                            isSelected={false}
                            isSwapping={false}
                            onToggle={onElectiveToggle}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {filteredAvail.length === 0 && filteredTba.length === 0 && filteredConflicting.length === 0 && filteredPrereqNotMet.length === 0 && (
                  <div style={{ padding: '24px 0', textAlign: 'center', color: '#9ca3af' }}>
                    <p style={{ fontSize: '12px' }}>{searchTerm ? 'No matches.' : 'No options found.'}</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
