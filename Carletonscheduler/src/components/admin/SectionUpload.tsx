import { useState, useEffect } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { Button } from '../ui/button';
import { API_BASE_URL, authenticatedFetch } from '../../config/constants';

interface TermData {
  code: string;
  sectionCount: number;
}

interface UploadResult {
  success: boolean;
  imported: number;
  errors: number;
  totalRecords: number;
  mode: string;
  term: string;
}

interface SectionUploadProps {
  onUploadComplete: () => void;
}

export function SectionUpload({ onUploadComplete }: SectionUploadProps) {
  const [terms, setTerms] = useState<TermData[]>([]);
  const [loadingTerms, setLoadingTerms] = useState(true);
  const [uploadMode, setUploadMode] = useState<'replace_all' | 'add_term'>('add_term');
  const [selectedTerm, setSelectedTerm] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showTermDropdown, setShowTermDropdown] = useState(false);

  useEffect(() => {
    fetchTerms();
  }, []);

  const fetchTerms = async () => {
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/admin/sections/terms`);
      if (response.ok) {
        const data = await response.json();
        setTerms(data.terms || []);
      }
    } catch (error) {
      console.error('Failed to fetch terms:', error);
    } finally {
      setLoadingTerms(false);
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

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = (file: File) => {
    const validExtensions = ['.txt', '.tsv', '.csv'];
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    
    if (validExtensions.includes(ext)) {
      setSelectedFile(file);
      setUploadError(null);
      setUploadResult(null);
    } else {
      setUploadError('Please upload a .txt, .tsv, or .csv file');
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    
    if (uploadMode === 'add_term' && !selectedTerm) {
      setUploadError('Please select or enter a term code');
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadResult(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const params = new URLSearchParams({ mode: uploadMode });
      if (uploadMode === 'add_term') {
        params.append('term', selectedTerm);
      }

      const response = await authenticatedFetch(`${API_BASE_URL}/admin/sections/upload?${params}`, {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (!response.ok) {
        setUploadError(data.error || 'Upload failed');
        return;
      }

      setUploadResult(data);
      setSelectedFile(null);
      fetchTerms();
      onUploadComplete();
    } catch (error) {
      setUploadError('Failed to upload file. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteTerm = async (termCode: string) => {
    if (!confirm(`Delete all sections for ${formatTermCode(termCode)}? This cannot be undone.`)) {
      return;
    }

    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/admin/sections/term/${termCode}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        fetchTerms();
        onUploadComplete();
      }
    } catch (error) {
      console.error('Failed to delete term:', error);
    }
  };

  return (
    <div style={{ padding: '32px' }}>
      {/* Upload Section */}
      <div style={{ marginBottom: '40px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#111', marginBottom: '8px' }}>
          Upload Section Data
        </h2>
        <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '24px' }}>
          Upload a tab-separated file containing course section data from Carleton's timetable
        </p>

        {/* Upload Mode Selection */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ fontSize: '13px', fontWeight: 500, color: '#334155', display: 'block', marginBottom: '8px' }}>
            Upload Mode
          </label>
          <div style={{ display: 'flex', gap: '12px' }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 16px',
                background: uploadMode === 'add_term' ? '#fef2f2' : '#f8fafc',
                border: '1px solid',
                borderColor: uploadMode === 'add_term' ? '#fecaca' : '#e2e8f0',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 150ms'
              }}
            >
              <input
                type="radio"
                name="mode"
                checked={uploadMode === 'add_term'}
                onChange={() => setUploadMode('add_term')}
                style={{ accentColor: '#bf112b' }}
              />
              <div>
                <div style={{ fontSize: '14px', fontWeight: 500, color: '#111' }}>Add/Update Term</div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>Replace sections for a specific term</div>
              </div>
            </label>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 16px',
                background: uploadMode === 'replace_all' ? '#fef2f2' : '#f8fafc',
                border: '1px solid',
                borderColor: uploadMode === 'replace_all' ? '#fecaca' : '#e2e8f0',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 150ms'
              }}
            >
              <input
                type="radio"
                name="mode"
                checked={uploadMode === 'replace_all'}
                onChange={() => setUploadMode('replace_all')}
                style={{ accentColor: '#bf112b' }}
              />
              <div>
                <div style={{ fontSize: '14px', fontWeight: 500, color: '#111' }}>Replace All</div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>Delete all existing sections first</div>
              </div>
            </label>
          </div>
        </div>

        {/* Term Selection (for add_term mode) */}
        {uploadMode === 'add_term' && (
          <div style={{ marginBottom: '20px' }}>
            <label style={{ fontSize: '13px', fontWeight: 500, color: '#334155', display: 'block', marginBottom: '8px' }}>
              Target Term
            </label>
            <div style={{ position: 'relative', maxWidth: '280px' }}>
              <button
                type="button"
                onClick={() => setShowTermDropdown(!showTermDropdown)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  fontSize: '14px',
                  textAlign: 'left',
                  background: '#fff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <span style={{ color: selectedTerm ? '#111' : '#94a3b8' }}>
                  {selectedTerm ? `${formatTermCode(selectedTerm)} (${selectedTerm})` : 'Select or enter term code'}
                </span>
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </button>
              
              {showTermDropdown && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    marginTop: '4px',
                    background: '#fff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                    zIndex: 20,
                    maxHeight: '280px',
                    overflow: 'auto'
                  }}
                >
                  {/* Manual entry at top */}
                  <div style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9' }}>
                    <input
                      type="text"
                      placeholder="Type term code, e.g. 202730"
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        fontSize: '13px',
                        border: '1px solid #e2e8f0',
                        borderRadius: '6px'
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          const value = (e.target as HTMLInputElement).value.trim();
                          if (value.length === 6 && /^\d+$/.test(value)) {
                            setSelectedTerm(value);
                            setShowTermDropdown(false);
                          }
                        }
                      }}
                    />
                  </div>
                  
                  {/* Existing terms */}
                  {terms.length > 0 && (
                    <>
                      {terms.map(term => (
                        <button
                          key={term.code}
                          onClick={() => { setSelectedTerm(term.code); setShowTermDropdown(false); }}
                          style={{
                            width: '100%',
                            padding: '10px 12px',
                            fontSize: '14px',
                            textAlign: 'left',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#111',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <span>{formatTermCode(term.code)} <span style={{ color: '#94a3b8' }}>({term.code})</span></span>
                          <span style={{ fontSize: '12px', color: '#94a3b8' }}>{term.sectionCount.toLocaleString()}</span>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
            <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '6px' }}>
              Format: YYYYTT (e.g., 202730 for Fall 2027)
            </p>
          </div>
        )}

        {/* File Drop Zone */}
        <div
          style={{
            position: 'relative',
            border: '2px dashed',
            borderColor: dragActive ? '#bf112b' : selectedFile ? '#10b981' : '#e2e8f0',
            borderRadius: '12px',
            padding: selectedFile ? '20px' : '40px 24px',
            textAlign: 'center',
            transition: 'all 150ms',
            background: dragActive ? '#fef2f2' : selectedFile ? '#f0fdf4' : '#fafafa',
          }}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          {!selectedFile && (
            <input
              type="file"
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                opacity: 0,
                cursor: 'pointer',
                zIndex: 10
              }}
              onChange={handleFileChange}
              accept=".txt,.tsv,.csv"
            />
          )}
          
          {selectedFile ? (
            <div>
              <p style={{ fontSize: '14px', fontWeight: 500, color: '#111', marginBottom: '4px' }}>
                {selectedFile.name}
              </p>
              <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>
                {(selectedFile.size / 1024).toFixed(1)} KB
              </p>
              
              {uploadError && (
                <p style={{ 
                  fontSize: '13px', 
                  color: '#dc2626', 
                  marginBottom: '16px',
                  padding: '8px 12px',
                  background: '#fef2f2',
                  borderRadius: '6px',
                  display: 'inline-block'
                }}>
                  {uploadError}
                </p>
              )}

              {uploadResult && (
                <div style={{ 
                  marginBottom: '16px',
                  padding: '12px 16px',
                  background: uploadResult.errors > 0 ? '#fef3c7' : '#ecfdf5',
                  borderRadius: '8px',
                  textAlign: 'left'
                }}>
                  <p style={{ fontSize: '14px', fontWeight: 500, color: uploadResult.errors > 0 ? '#92400e' : '#065f46' }}>
                    Import completed
                  </p>
                  <p style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
                    {uploadResult.imported.toLocaleString()} sections imported
                    {uploadResult.errors > 0 && `, ${uploadResult.errors} errors`}
                  </p>
                </div>
              )}
              
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
                <Button onClick={handleUpload} disabled={isUploading}>
                  {isUploading ? 'Uploading...' : 'Upload'}
                </Button>
                <button
                  onClick={() => {
                    setSelectedFile(null);
                    setUploadError(null);
                    setUploadResult(null);
                  }}
                  style={{
                    fontSize: '14px',
                    color: '#64748b',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer'
                  }}
                  className="hover:underline"
                >
                  Change file
                </button>
              </div>
            </div>
          ) : (
            <>
              <p style={{ fontSize: '15px', fontWeight: 500, color: '#111', marginBottom: '6px' }}>
                Drop your section data file here
              </p>
              <p style={{ fontSize: '14px', color: '#94a3b8' }}>
                or click to browse
              </p>
              <p style={{ fontSize: '12px', color: '#cbd5e1', marginTop: '16px' }}>
                Tab-separated values (.txt, .tsv, .csv)
              </p>
            </>
          )}
        </div>

        {/* Format Help */}
        <details style={{ marginTop: '16px' }}>
          <summary style={{ fontSize: '13px', color: '#64748b', cursor: 'pointer' }}>
            Expected file format
          </summary>
          <div style={{ 
            marginTop: '8px', 
            padding: '12px 16px', 
            background: '#f8fafc', 
            borderRadius: '8px',
            fontSize: '12px',
            color: '#64748b',
            fontFamily: 'monospace',
            overflow: 'auto'
          }}>
            <p style={{ marginBottom: '8px' }}>Tab-separated columns:</p>
            <code>term, sectionId, dept, courseNum, sectionCode, sectionType, days, startTime, endTime, startDate, endDate, capacity, enrolled, status</code>
            <p style={{ marginTop: '12px', marginBottom: '4px' }}>Example:</p>
            <code>202730{'\t'}12345{'\t'}SYSC{'\t'}4907{'\t'}A{'\t'}LEC{'\t'}Mon Wed{'\t'}10:05{'\t'}11:25{'\t'}2027-09-08{'\t'}2027-12-08{'\t'}60{'\t'}45{'\t'}Open</code>
          </div>
        </details>
      </div>

      {/* Existing Terms */}
      <div>
        <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#111', marginBottom: '8px' }}>
          Existing Terms
        </h2>
        <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '20px' }}>
          Manage section data by term
        </p>

        {loadingTerms ? (
          <p style={{ fontSize: '14px', color: '#94a3b8' }}>Loading...</p>
        ) : terms.length === 0 ? (
          <div style={{ 
            padding: '40px',
            textAlign: 'center',
            background: '#f8fafc',
            borderRadius: '12px',
            border: '1px solid #f1f5f9'
          }}>
            <p style={{ fontSize: '14px', color: '#64748b' }}>No section data uploaded yet</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {terms.map(term => (
              <div
                key={term.code}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '16px 20px',
                  background: '#f8fafc',
                  borderRadius: '10px',
                  border: '1px solid #f1f5f9'
                }}
              >
                <div>
                  <p style={{ fontSize: '15px', fontWeight: 500, color: '#111' }}>
                    {formatTermCode(term.code)}
                  </p>
                  <p style={{ fontSize: '13px', color: '#64748b', marginTop: '2px' }}>
                    {term.sectionCount.toLocaleString()} sections
                  </p>
                </div>
                <button
                  onClick={() => handleDeleteTerm(term.code)}
                  style={{
                    padding: '8px',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    color: '#94a3b8',
                    transition: 'all 150ms'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = '#fee2e2';
                    e.currentTarget.style.color = '#dc2626';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = '#94a3b8';
                  }}
                  title="Delete term"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
