import { useState } from 'react';
import { Button } from './ui/button';

interface AcademicHistoryImportProps {
  onManualEntry: () => void;
  onUploadComplete: (file: File) => void;
}

export function AcademicHistoryImport({ onManualEntry, onUploadComplete }: AcademicHistoryImportProps) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = (file: File) => {
    const validTypes = ['text/html', 'application/pdf'];
    const validExtensions = ['.html', '.htm', '.pdf'];
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    
    if (validTypes.includes(file.type) || validExtensions.includes(fileExtension)) {
      setSelectedFile(file);
      setUploadError(null);
    } else {
      setUploadError('Please upload a valid HTML or PDF file.');
    }
  };

  const handleUpload = async () => {
    if (selectedFile) {
      setIsUploading(true);
      setUploadError(null);
      try {
        await onUploadComplete(selectedFile);
      } catch (error) {
        setUploadError(error instanceof Error ? error.message : 'Upload failed');
        setIsUploading(false);
      }
    }
  };

  return (
    <div className="min-h-screen" style={{ background: '#f8fafc' }}>
      <main style={{ maxWidth: '480px', margin: '0 auto', padding: '80px 24px' }}>
        {/* Header */}
        <div style={{ marginBottom: '48px', textAlign: 'center' }}>
          <h1 style={{ 
            fontSize: '32px', 
            fontWeight: 600, 
            color: '#111', 
            letterSpacing: '-0.02em',
            marginBottom: '12px'
          }}>
            Carleton Scheduler
          </h1>
          <p style={{ fontSize: '16px', color: '#64748b', lineHeight: 1.6 }}>
            Upload your Academic Audit to get personalized course recommendations
          </p>
        </div>

        {/* Upload Card */}
        <div 
          style={{ 
            background: '#fff', 
            borderRadius: '16px', 
            border: '1px solid #e2e8f0',
            padding: '32px',
            marginBottom: '16px'
          }}
        >
          {/* Drop Zone */}
          <div
            style={{
              position: 'relative',
              border: '2px dashed',
              borderColor: dragActive ? '#bf112b' : selectedFile ? '#10b981' : '#e2e8f0',
              borderRadius: '12px',
              padding: selectedFile ? '24px' : '48px 24px',
              textAlign: 'center',
              transition: 'all 150ms ease',
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
                id="file-upload"
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  opacity: 0,
                  cursor: 'pointer',
                  zIndex: 10
                }}
                onChange={handleChange}
                accept=".html,.htm,.pdf"
              />
            )}
            
            {selectedFile ? (
              <div>
                <p style={{ 
                  fontSize: '14px', 
                  fontWeight: 500, 
                  color: '#111',
                  marginBottom: '4px'
                }}>
                  {selectedFile.name}
                </p>
                <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '20px' }}>
                  {(selectedFile.size / 1024).toFixed(1)} KB
                </p>
                
                {uploadError && (
                  <p style={{ 
                    fontSize: '13px', 
                    color: '#dc2626', 
                    marginBottom: '16px',
                    padding: '8px 12px',
                    background: '#fef2f2',
                    borderRadius: '6px'
                  }}>
                    {uploadError}
                  </p>
                )}
                
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
                  <Button onClick={handleUpload} disabled={isUploading}>
                    {isUploading ? 'Processing...' : 'Continue'}
                  </Button>
                  <button
                    onClick={() => {
                      setSelectedFile(null);
                      setUploadError(null);
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
                <p style={{ 
                  fontSize: '15px', 
                  fontWeight: 500, 
                  color: '#111',
                  marginBottom: '6px'
                }}>
                  Drop your audit file here
                </p>
                <p style={{ fontSize: '14px', color: '#94a3b8' }}>
                  or click to browse
                </p>
                <p style={{ 
                  fontSize: '12px', 
                  color: '#cbd5e1', 
                  marginTop: '16px' 
                }}>
                  HTML or PDF
                </p>
              </>
            )}
          </div>

          {/* Tip */}
          <p style={{ 
            fontSize: '13px', 
            color: '#94a3b8', 
            marginTop: '16px',
            lineHeight: 1.5
          }}>
            For best results, save your audit as HTML from{' '}
            <a 
              href="https://central.carleton.ca" 
              target="_blank" 
              rel="noopener noreferrer"
              style={{ color: '#64748b', textDecoration: 'underline' }}
            >
              Carleton Central
            </a>
          </p>
        </div>

        {/* Manual Entry Option */}
        <button
          onClick={onManualEntry}
          style={{
            width: '100%',
            padding: '16px 20px',
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            textAlign: 'left',
            cursor: 'pointer',
            transition: 'all 150ms ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#cbd5e1';
            e.currentTarget.style.background = '#fafafa';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#e2e8f0';
            e.currentTarget.style.background = '#fff';
          }}
        >
          <p style={{ fontSize: '14px', fontWeight: 500, color: '#111', marginBottom: '2px' }}>
            Skip this step
          </p>
          <p style={{ fontSize: '13px', color: '#94a3b8' }}>
            Continue without uploading an audit
          </p>
        </button>
      </main>
    </div>
  );
}
