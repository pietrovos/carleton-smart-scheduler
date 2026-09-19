import { useState, useEffect, useCallback } from 'react';
import { Search, ChevronDown, ChevronRight, X, Plus } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { API_BASE_URL, authenticatedFetch } from '../../config/constants';

interface PrerequisiteNode {
  id: string;
  nodeType: 'AND' | 'OR' | 'COURSE' | 'YEAR_STANDING' | 'PERMISSION';
  requiredCourseId: string | null;
  requiredYear?: number | null;
  requiredGrade?: string | null;
  parentId: string | null;
}

interface CourseData {
  id: string;
  title: string;
  description?: string;
  credits?: number;
  prerequisiteExpression?: string;
  prerequisiteNodes: PrerequisiteNode[];
  sectionCount: number;
}

interface PaginationData {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

// Temporary IDs for new nodes before saving
let tempIdCounter = 0;
function generateTempId(): string {
  return `temp_${++tempIdCounter}`;
}

export function CourseEditor() {
  const [courses, setCourses] = useState<CourseData[]>([]);
  const [pagination, setPagination] = useState<PaginationData>({ page: 1, limit: 50, total: 0, pages: 0 });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedCourse, setSelectedCourse] = useState<CourseData | null>(null);
  const [editingPrereqs, setEditingPrereqs] = useState<PrerequisiteNode[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCourse, setNewCourse] = useState({ id: '', title: '', credits: 0.5 });
  const [createError, setCreateError] = useState<string | null>(null);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPagination(prev => ({ ...prev, page: 1 }));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch courses when debounced search or page changes
  useEffect(() => {
    const fetchCourses = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: pagination.page.toString(),
          limit: '50'
        });
        if (debouncedSearch) {
          params.append('search', debouncedSearch);
        }

        const response = await authenticatedFetch(`${API_BASE_URL}/admin/courses?${params}`);
        if (response.ok) {
          const data = await response.json();
          setCourses(data.courses);
          setPagination(prev => ({ ...prev, total: data.pagination.total, pages: data.pagination.pages }));
        }
      } catch (error) {
        console.error('Failed to fetch courses:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchCourses();
  }, [pagination.page, debouncedSearch]);

  const refetchCourses = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: '50'
      });
      if (debouncedSearch) {
        params.append('search', debouncedSearch);
      }

      const response = await authenticatedFetch(`${API_BASE_URL}/admin/courses?${params}`);
      if (response.ok) {
        const data = await response.json();
        setCourses(data.courses);
        setPagination(prev => ({ ...prev, total: data.pagination.total, pages: data.pagination.pages }));
      }
    } catch (error) {
      console.error('Failed to fetch courses:', error);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, debouncedSearch]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const handleSelectCourse = (course: CourseData) => {
    setSelectedCourse(course);
    setEditingPrereqs([...course.prerequisiteNodes]);
  };

  const handleCreateCourse = async () => {
    if (!newCourse.id.trim()) {
      setCreateError('Course ID is required');
      return;
    }

    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/admin/courses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: newCourse.id.toUpperCase().replace(/\s+/g, ''),
          title: newCourse.title || newCourse.id,
          credits: newCourse.credits
        })
      });

      const data = await response.json();

      if (!response.ok) {
        setCreateError(data.error || 'Failed to create course');
        return;
      }

      setShowCreateModal(false);
      setNewCourse({ id: '', title: '', credits: 0.5 });
      setCreateError(null);
      refetchCourses();
    } catch (error) {
      setCreateError('Failed to create course');
    }
  };

  const handleSavePrerequisites = async () => {
    if (!selectedCourse) return;

    setIsSaving(true);
    try {
      // Convert tree to expression (simplified)
      const expression = buildExpressionFromNodes(editingPrereqs);

      const response = await authenticatedFetch(`${API_BASE_URL}/admin/courses/${selectedCourse.id}/prerequisites`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expression,
          nodes: editingPrereqs.map(node => ({
            tempId: node.id,
            nodeType: node.nodeType,
            requiredCourseId: node.requiredCourseId,
            parentId: node.parentId
          }))
        })
      });

      if (response.ok) {
        const data = await response.json();
        // Update local state
        setCourses(prev => prev.map(c => 
          c.id === selectedCourse.id 
            ? { ...c, prerequisiteNodes: data.course.prerequisiteNodes || [] }
            : c
        ));
        setSelectedCourse(prev => prev ? { ...prev, prerequisiteNodes: data.course.prerequisiteNodes || [] } : null);
        setEditingPrereqs(data.course.prerequisiteNodes || []);
      }
    } catch (error) {
      console.error('Failed to save prerequisites:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const buildExpressionFromNodes = (nodes: PrerequisiteNode[]): string => {
    // Find root nodes (no parent)
    const roots = nodes.filter(n => !n.parentId);
    if (roots.length === 0) return '';
    
    const buildExpression = (nodeId: string): string => {
      const node = nodes.find(n => n.id === nodeId);
      if (!node) return '';

      if (node.nodeType === 'COURSE') {
        return node.requiredCourseId || '';
      }

      const children = nodes.filter(n => n.parentId === nodeId);
      if (children.length === 0) return '';

      const childExpressions = children.map(c => buildExpression(c.id)).filter(Boolean);
      if (childExpressions.length === 0) return '';
      if (childExpressions.length === 1) return childExpressions[0];

      const operator = node.nodeType === 'AND' ? ' && ' : ' || ';
      return `(${childExpressions.join(operator)})`;
    };

    return roots.map(r => buildExpression(r.id)).filter(Boolean).join(' && ');
  };

  // Prerequisite tree manipulation
  const addRootNode = (nodeType: 'AND' | 'OR') => {
    const newNode: PrerequisiteNode = {
      id: generateTempId(),
      nodeType,
      requiredCourseId: null,
      parentId: null
    };
    setEditingPrereqs(prev => [...prev, newNode]);
  };

  const addChildNode = (parentId: string, nodeType: PrerequisiteNode['nodeType'], courseId?: string) => {
    const newNode: PrerequisiteNode = {
      id: generateTempId(),
      nodeType,
      requiredCourseId: courseId || null,
      parentId
    };
    setEditingPrereqs(prev => [...prev, newNode]);
  };

  const removeNode = (nodeId: string) => {
    // Remove node and all its descendants
    const toRemove = new Set<string>();
    const collectDescendants = (id: string) => {
      toRemove.add(id);
      editingPrereqs.filter(n => n.parentId === id).forEach(n => collectDescendants(n.id));
    };
    collectDescendants(nodeId);
    setEditingPrereqs(prev => prev.filter(n => !toRemove.has(n.id)));
  };

  const hasChanges = () => {
    if (!selectedCourse) return false;
    const original = JSON.stringify(selectedCourse.prerequisiteNodes);
    const current = JSON.stringify(editingPrereqs);
    return original !== current;
  };

  return (
    <div style={{ display: 'flex', minHeight: '600px' }}>
      {/* Course List Sidebar */}
      <div 
        style={{ 
          width: '360px', 
          borderRight: '1px solid #e2e8f0',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Search & Create */}
        <div style={{ padding: '20px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search 
                className="absolute w-4 h-4 text-slate-400" 
                style={{ left: '12px', top: '50%', transform: 'translateY(-50%)' }} 
              />
              <Input
                type="text"
                placeholder="Search courses..."
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                style={{ 
                  paddingLeft: '38px',
                  height: '40px',
                  fontSize: '14px'
                }}
              />
            </div>
            <Button 
              onClick={() => setShowCreateModal(true)}
              size="sm"
              style={{ height: '40px', whiteSpace: 'nowrap' }}
            >
              <Plus className="w-4 h-4 mr-1" /> New
            </Button>
          </div>
          <p style={{ fontSize: '12px', color: '#94a3b8' }}>
            {pagination.total.toLocaleString()} courses
          </p>
        </div>

        {/* Course List */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center' }}>
              <p style={{ fontSize: '14px', color: '#94a3b8' }}>Loading...</p>
            </div>
          ) : courses.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center' }}>
              <p style={{ fontSize: '14px', color: '#64748b' }}>No courses found</p>
            </div>
          ) : (
            <div>
              {courses.map(course => (
                <button
                  key={course.id}
                  onClick={() => handleSelectCourse(course)}
                  style={{
                    width: '100%',
                    padding: '14px 20px',
                    textAlign: 'left',
                    background: selectedCourse?.id === course.id ? '#f8fafc' : 'transparent',
                    border: 'none',
                    borderBottom: '1px solid #f1f5f9',
                    cursor: 'pointer',
                    transition: 'background 150ms'
                  }}
                  onMouseEnter={e => {
                    if (selectedCourse?.id !== course.id) {
                      e.currentTarget.style.background = '#fafafa';
                    }
                  }}
                  onMouseLeave={e => {
                    if (selectedCourse?.id !== course.id) {
                      e.currentTarget.style.background = 'transparent';
                    }
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '14px', fontWeight: 500, color: '#111' }}>
                      {course.id}
                    </span>
                    {course.prerequisiteNodes.length > 0 && (
                      <span style={{ 
                        fontSize: '11px', 
                        color: '#64748b',
                        background: '#f1f5f9',
                        padding: '2px 6px',
                        borderRadius: '4px'
                      }}>
                        Has prereqs
                      </span>
                    )}
                  </div>
                  {course.title !== course.id && (
                    <p style={{ 
                      fontSize: '13px', 
                      color: '#64748b', 
                      marginTop: '2px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {course.title}
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {pagination.pages > 1 && (
          <div 
            style={{ 
              padding: '12px 20px', 
              borderTop: '1px solid #f1f5f9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <button
              onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
              disabled={pagination.page <= 1}
              style={{
                padding: '6px 12px',
                fontSize: '13px',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                cursor: pagination.page <= 1 ? 'not-allowed' : 'pointer',
                opacity: pagination.page <= 1 ? 0.5 : 1
              }}
            >
              Previous
            </button>
            <span style={{ fontSize: '13px', color: '#64748b' }}>
              Page {pagination.page} of {pagination.pages}
            </span>
            <button
              onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
              disabled={pagination.page >= pagination.pages}
              style={{
                padding: '6px 12px',
                fontSize: '13px',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                cursor: pagination.page >= pagination.pages ? 'not-allowed' : 'pointer',
                opacity: pagination.page >= pagination.pages ? 0.5 : 1
              }}
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Course Editor Panel */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {!selectedCourse ? (
          <div style={{ 
            flex: 1, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            padding: '40px'
          }}>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: '15px', color: '#64748b' }}>
                Select a course to edit its prerequisites
              </p>
              <p style={{ fontSize: '13px', color: '#94a3b8', marginTop: '4px' }}>
                Or create a new course
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Course Header */}
            <div style={{ padding: '24px 32px', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between' }}>
                <div>
                  <h2 style={{ fontSize: '20px', fontWeight: 600, color: '#111' }}>
                    {selectedCourse.id}
                  </h2>
                  {selectedCourse.title !== selectedCourse.id && (
                    <p style={{ fontSize: '14px', color: '#64748b', marginTop: '4px' }}>
                      {selectedCourse.title}
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: '16px', marginTop: '8px' }}>
                    {selectedCourse.credits && (
                      <span style={{ fontSize: '13px', color: '#94a3b8' }}>
                        {selectedCourse.credits} credits
                      </span>
                    )}
                    <span style={{ fontSize: '13px', color: '#94a3b8' }}>
                      {selectedCourse.sectionCount} sections
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedCourse(null)}
                  style={{
                    padding: '6px',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    color: '#94a3b8'
                  }}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Prerequisite Editor */}
            <div style={{ flex: 1, overflow: 'auto', padding: '24px 32px' }}>
              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#111', marginBottom: '8px' }}>
                  Prerequisites
                </h3>
                <p style={{ fontSize: '13px', color: '#64748b' }}>
                  Build a prerequisite tree using AND/OR logic
                </p>
              </div>

              {/* Current Expression (read-only) */}
              {selectedCourse.prerequisiteExpression && (
                <div style={{ 
                  marginBottom: '20px',
                  padding: '12px 16px',
                  background: '#f8fafc',
                  borderRadius: '8px',
                  fontSize: '13px',
                  color: '#64748b',
                  fontFamily: 'monospace'
                }}>
                  {selectedCourse.prerequisiteExpression}
                </div>
              )}

              {/* Prerequisite Tree Builder */}
              <div style={{ marginBottom: '24px' }}>
                {editingPrereqs.filter(n => !n.parentId).length === 0 ? (
                  <div style={{ 
                    padding: '32px',
                    textAlign: 'center',
                    background: '#fafafa',
                    borderRadius: '12px',
                    border: '2px dashed #e2e8f0'
                  }}>
                    <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '16px' }}>
                      No prerequisites defined
                    </p>
                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                      <Button variant="outline" size="sm" onClick={() => addRootNode('AND')}>
                        Add AND group
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => addRootNode('OR')}>
                        Add OR group
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {editingPrereqs.filter(n => !n.parentId).map(rootNode => (
                      <PrerequisiteNodeEditor
                        key={rootNode.id}
                        node={rootNode}
                        allNodes={editingPrereqs}
                        onAddChild={addChildNode}
                        onRemove={removeNode}
                        depth={0}
                      />
                    ))}
                    <div style={{ marginTop: '8px' }}>
                      <button
                        onClick={() => addRootNode('AND')}
                        style={{
                          padding: '8px 12px',
                          fontSize: '13px',
                          color: '#64748b',
                          background: 'transparent',
                          border: '1px dashed #e2e8f0',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          marginRight: '8px'
                        }}
                      >
                        + Add AND group
                      </button>
                      <button
                        onClick={() => addRootNode('OR')}
                        style={{
                          padding: '8px 12px',
                          fontSize: '13px',
                          color: '#64748b',
                          background: 'transparent',
                          border: '1px dashed #e2e8f0',
                          borderRadius: '8px',
                          cursor: 'pointer'
                        }}
                      >
                        + Add OR group
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Save Bar */}
            {hasChanges() && (
              <div style={{ 
                padding: '16px 32px', 
                borderTop: '1px solid #f1f5f9',
                background: '#fafafa',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <p style={{ fontSize: '13px', color: '#64748b' }}>
                  You have unsaved changes
                </p>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setEditingPrereqs([...selectedCourse.prerequisiteNodes])}
                  >
                    Discard
                  </Button>
                  <Button 
                    size="sm" 
                    onClick={handleSavePrerequisites}
                    disabled={isSaving}
                  >
                    {isSaving ? 'Saving...' : 'Save changes'}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Create Course Modal */}
      {showCreateModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50
          }}
          onClick={() => setShowCreateModal(false)}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '16px',
              padding: '32px',
              width: '100%',
              maxWidth: '420px'
            }}
            onClick={e => e.stopPropagation()}
          >
            <h2 style={{ fontSize: '20px', fontWeight: 600, color: '#111', marginBottom: '20px' }}>
              Create New Course
            </h2>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '13px', fontWeight: 500, color: '#334155', display: 'block', marginBottom: '6px' }}>
                Course ID
              </label>
              <Input
                type="text"
                placeholder="e.g., SYSC4907"
                value={newCourse.id}
                onChange={(e) => setNewCourse(prev => ({ ...prev, id: e.target.value.toUpperCase() }))}
                style={{ height: '42px' }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '13px', fontWeight: 500, color: '#334155', display: 'block', marginBottom: '6px' }}>
                Title
              </label>
              <Input
                type="text"
                placeholder="e.g., Engineering Project"
                value={newCourse.title}
                onChange={(e) => setNewCourse(prev => ({ ...prev, title: e.target.value }))}
                style={{ height: '42px' }}
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ fontSize: '13px', fontWeight: 500, color: '#334155', display: 'block', marginBottom: '6px' }}>
                Credits
              </label>
              <select
                value={newCourse.credits}
                onChange={(e) => setNewCourse(prev => ({ ...prev, credits: parseFloat(e.target.value) }))}
                style={{
                  width: '100%',
                  height: '42px',
                  padding: '0 12px',
                  fontSize: '14px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  background: '#fff'
                }}
              >
                <option value={0.25}>0.25</option>
                <option value={0.5}>0.5</option>
                <option value={1}>1.0</option>
              </select>
            </div>

            {createError && (
              <p style={{ 
                fontSize: '13px', 
                color: '#dc2626', 
                marginBottom: '16px',
                padding: '8px 12px',
                background: '#fef2f2',
                borderRadius: '6px'
              }}>
                {createError}
              </p>
            )}

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <Button variant="outline" onClick={() => setShowCreateModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateCourse}>
                Create Course
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Recursive component for rendering prerequisite nodes
function PrerequisiteNodeEditor({
  node,
  allNodes,
  onAddChild,
  onRemove,
  depth
}: {
  node: PrerequisiteNode;
  allNodes: PrerequisiteNode[];
  onAddChild: (parentId: string, nodeType: PrerequisiteNode['nodeType'], courseId?: string) => void;
  onRemove: (nodeId: string) => void;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(true);
  const [showCourseInput, setShowCourseInput] = useState(false);
  const [courseInputValue, setCourseInputValue] = useState('');

  const children = allNodes.filter(n => n.parentId === node.id);
  const isLogicalNode = node.nodeType === 'AND' || node.nodeType === 'OR';

  const handleAddCourse = () => {
    if (courseInputValue.trim()) {
      onAddChild(node.id, 'COURSE', courseInputValue.trim().toUpperCase());
      setCourseInputValue('');
      setShowCourseInput(false);
    }
  };

  if (node.nodeType === 'COURSE') {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          background: '#f0fdf4',
          borderRadius: '6px',
          border: '1px solid #bbf7d0',
          marginLeft: depth > 0 ? '24px' : 0
        }}
      >
        <span style={{ fontSize: '14px', fontWeight: 500, color: '#166534' }}>
          {node.requiredCourseId}
        </span>
        <button
          onClick={() => onRemove(node.id)}
          style={{
            marginLeft: 'auto',
            padding: '4px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: '#94a3b8',
            borderRadius: '4px'
          }}
          onMouseEnter={e => e.currentTarget.style.color = '#dc2626'}
          onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        border: '1px solid',
        borderColor: node.nodeType === 'AND' ? '#dbeafe' : '#fce7f3',
        borderRadius: '10px',
        background: node.nodeType === 'AND' ? '#f8faff' : '#fdf4f8',
        marginLeft: depth > 0 ? '24px' : 0
      }}
    >
      {/* Node Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 14px',
          cursor: 'pointer'
        }}
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-slate-400" />
        )}
        <span
          style={{
            fontSize: '12px',
            fontWeight: 600,
            color: node.nodeType === 'AND' ? '#1d4ed8' : '#be185d',
            background: node.nodeType === 'AND' ? '#dbeafe' : '#fce7f3',
            padding: '2px 8px',
            borderRadius: '4px',
            textTransform: 'uppercase'
          }}
        >
          {node.nodeType}
        </span>
        <span style={{ fontSize: '13px', color: '#64748b' }}>
          {children.length} {children.length === 1 ? 'item' : 'items'}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(node.id); }}
          style={{
            marginLeft: 'auto',
            padding: '4px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: '#94a3b8',
            borderRadius: '4px'
          }}
          onMouseEnter={e => e.currentTarget.style.color = '#dc2626'}
          onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Children */}
      {expanded && (
        <div style={{ padding: '0 14px 14px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {children.map(child => (
              <PrerequisiteNodeEditor
                key={child.id}
                node={child}
                allNodes={allNodes}
                onAddChild={onAddChild}
                onRemove={onRemove}
                depth={depth + 1}
              />
            ))}

            {/* Add Course Input */}
            {showCourseInput ? (
              <div style={{ display: 'flex', gap: '8px', marginLeft: depth > 0 ? '24px' : 0 }}>
                <Input
                  type="text"
                  placeholder="Course code (e.g., SYSC2004)"
                  value={courseInputValue}
                  onChange={(e) => setCourseInputValue(e.target.value.toUpperCase())}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddCourse(); }}
                  style={{ height: '36px', fontSize: '13px', flex: 1 }}
                  autoFocus
                />
                <Button size="sm" onClick={handleAddCourse} style={{ height: '36px' }}>
                  Add
                </Button>
                <button
                  onClick={() => { setShowCourseInput(false); setCourseInputValue(''); }}
                  style={{
                    padding: '8px',
                    background: '#f1f5f9',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer'
                  }}
                >
                  <X className="w-4 h-4 text-slate-500" />
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '8px', marginLeft: depth > 0 ? '24px' : 0, marginTop: '4px' }}>
                <button
                  onClick={() => setShowCourseInput(true)}
                  style={{
                    padding: '6px 10px',
                    fontSize: '12px',
                    color: '#64748b',
                    background: 'transparent',
                    border: '1px dashed #d1d5db',
                    borderRadius: '6px',
                    cursor: 'pointer'
                  }}
                >
                  + Course
                </button>
                <button
                  onClick={() => onAddChild(node.id, 'AND')}
                  style={{
                    padding: '6px 10px',
                    fontSize: '12px',
                    color: '#64748b',
                    background: 'transparent',
                    border: '1px dashed #d1d5db',
                    borderRadius: '6px',
                    cursor: 'pointer'
                  }}
                >
                  + AND
                </button>
                <button
                  onClick={() => onAddChild(node.id, 'OR')}
                  style={{
                    padding: '6px 10px',
                    fontSize: '12px',
                    color: '#64748b',
                    background: 'transparent',
                    border: '1px dashed #d1d5db',
                    borderRadius: '6px',
                    cursor: 'pointer'
                  }}
                >
                  + OR
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
