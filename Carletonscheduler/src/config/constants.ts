export const API_BASE_URL = 'http://localhost:3001/api';

export function authenticatedFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const token = localStorage.getItem('auth_token');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}

export const BRAND_COLORS = {
  PRIMARY: '#bf112b',
  PRIMARY_HOVER: '#a00f25',
} as const;

export const SCHEDULE_CONFIG = {
  MAX_SUGGESTIONS: 10,
  DEFAULT_COURSE_LOAD: 5,
  MAX_SCHEDULES: 100,
  MAX_SEARCH_RESULTS: 8,
} as const;

export const TIMETABLE_CONFIG = {
  START_HOUR: 8,
  END_HOUR: 22,
  HOUR_HEIGHT_PX: 60,
  TIME_SLOTS: ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00'],
  DAYS: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const,
} as const;

export const COURSE_COLORS = [
  { bg: '#fee2e2', border: '#fca5a5', text: '#7f1d1d' },
  { bg: '#dbeafe', border: '#93c5fd', text: '#1e3a8a' },
  { bg: '#d1fae5', border: '#6ee7b7', text: '#064e3b' },
  { bg: '#fef3c7', border: '#fcd34d', text: '#78350f' },
  { bg: '#ede9fe', border: '#c4b5fd', text: '#4c1d95' },
  { bg: '#cffafe', border: '#67e8f9', text: '#164e63' },
  { bg: '#fce7f3', border: '#f9a8d4', text: '#831843' },
  { bg: '#ffedd5', border: '#fdba74', text: '#7c2d12' },
] as const;

export type CourseColor = typeof COURSE_COLORS[number];
export type Day = typeof TIMETABLE_CONFIG.DAYS[number];
