import { useState, useEffect } from 'react';
import { apiGetCalendarPosts } from '../api';
import { useAuth } from '../contexts/AuthContext';
import CalendarGrid from '../components/CalendarGrid';
import './Calendar.css';

export default function Calendar() {
  const { user } = useAuth();
  const [year, setYear] = useState(new Date().getFullYear());
  const [posts, setPosts] = useState([]);

  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;

    async function fetchDiaryPosts() {
      try {
        const { posts: data = [] } = await apiGetCalendarPosts(year);
        if (!cancelled) setPosts(data);
      } catch {
        if (!cancelled) setPosts([]);
      }
    }

    fetchDiaryPosts();
    return () => {
      cancelled = true;
    };
  }, [user, year]);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 10 }, (_, i) => currentYear - 5 + i);

  return (
    <div className="calendar-page">
      <div className="calendar-header">
        <h1>Calendar</h1>
        <div className="calendar-year-picker">
          <select value={year} onChange={(e) => setYear(parseInt(e.target.value, 10))}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>
      <CalendarGrid year={year} posts={posts} />
    </div>
  );
}
