import { useState, useEffect } from 'react';
import { SectionUpload } from './SectionUpload';
import { CourseEditor } from './CourseEditor';
import { ElectiveManager } from './ElectiveManager';
import { API_BASE_URL, authenticatedFetch } from '../../config/constants';

type AdminTab = 'sections' | 'courses' | 'electives';

interface AdminStats {
  courses: number;
  sections: number;
  recentTerms: Array<{ term: string; sections: number }>;
}

export function AdminPage() {
  const [activeTab, setActiveTab] = useState<AdminTab>('sections');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/admin/stats`);
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setLoadingStats(false);
    }
  };

  const formatTermCode = (code: string): string => {
    if (code.length !== 6) return code;
    const year = code.substring(0, 4);
    const term = code.substring(4);
    const termNames: Record<string, string> = {
      '10': 'Winter',
      '20': 'Summer',
      '30': 'Fall'
    };
    return `${termNames[term] || term} ${year}`;
  };

  const tabs: { id: AdminTab; label: string }[] = [
    { id: 'sections', label: 'Section Data' },
    { id: 'courses', label: 'Courses & Prerequisites' },
    { id: 'electives', label: 'Electives' },
  ];

  return (
    <div className="min-h-screen" style={{ background: '#f8fafc' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '48px 24px' }}>
        {/* Header */}
        <div style={{ marginBottom: '40px' }}>
          <h1 style={{ 
            fontSize: '32px', 
            fontWeight: 600, 
            color: '#111', 
            letterSpacing: '-0.02em',
            marginBottom: '8px'
          }}>
            Admin
          </h1>
          <p style={{ fontSize: '15px', color: '#64748b' }}>
            Manage section data, courses, and prerequisites
          </p>
        </div>

        {/* Stats Cards */}
        {!loadingStats && stats && (
          <div 
            style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '16px',
              marginBottom: '32px'
            }}
          >
            <StatCard label="Total Courses" value={stats.courses.toLocaleString()} />
            <StatCard label="Total Sections" value={stats.sections.toLocaleString()} />
            {stats.recentTerms.length > 0 && (
              <StatCard 
                label={formatTermCode(stats.recentTerms[0].term)} 
                value={stats.recentTerms[0].sections.toLocaleString()}
                sublabel="sections"
              />
            )}
          </div>
        )}

        {/* Tab Navigation */}
        <div 
          style={{ 
            display: 'flex',
            gap: '4px',
            padding: '4px',
            background: '#f1f5f9',
            borderRadius: '10px',
            width: 'fit-content',
            marginBottom: '24px'
          }}
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '10px 20px',
                fontSize: '14px',
                fontWeight: 500,
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 150ms',
                background: activeTab === tab.id ? '#fff' : 'transparent',
                color: activeTab === tab.id ? '#111' : '#64748b',
                boxShadow: activeTab === tab.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div 
          style={{ 
            background: '#fff',
            borderRadius: '16px',
            border: '1px solid #e2e8f0',
            overflow: 'hidden'
          }}
        >
          {activeTab === 'sections' && (
            <SectionUpload onUploadComplete={fetchStats} />
          )}
          {activeTab === 'courses' && (
            <CourseEditor />
          )}
          {activeTab === 'electives' && (
            <ElectiveManager />
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ 
  label, 
  value, 
  sublabel 
}: { 
  label: string; 
  value: string; 
  sublabel?: string;
}) {
  return (
    <div
      style={{
        padding: '20px 24px',
        background: '#fff',
        borderRadius: '12px',
        border: '1px solid #e2e8f0'
      }}
    >
      <div style={{ fontSize: '28px', fontWeight: 600, color: '#111', lineHeight: 1 }}>
        {value}
        {sublabel && (
          <span style={{ fontSize: '14px', fontWeight: 400, color: '#94a3b8', marginLeft: '6px' }}>
            {sublabel}
          </span>
        )}
      </div>
      <div style={{ fontSize: '14px', color: '#64748b', marginTop: '6px' }}>
        {label}
      </div>
    </div>
  );
}
