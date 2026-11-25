import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDaysInMonth, getFirstDayOfMonth, MONTH_ABBR, parseDateTag } from '../utils/dateHelpers';
import './CalendarGrid.css';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export default function CalendarGrid({ year, posts = [] }) {
  const navigate = useNavigate();
  const [hoveredDay, setHoveredDay] = useState(null);
  const [dayPickerPosts, setDayPickerPosts] = useState(null);

  const postMap = useMemo(() => {
    const map = {};
    posts.forEach((post) => {
      const parsed = parseDateTag(post.date_tag);
      if (parsed) {
        const key = `${parsed.year}-${parsed.month}-${parsed.day}`;
        if (!map[key]) map[key] = [];
        map[key].push({ title: post.title || 'Untitled', id: post.id });
      }
    });
    return map;
  }, [posts]);

  const today = new Date();

  function handleDayClick(dayPosts) {
    if (!dayPosts || dayPosts.length === 0) return;
    if (dayPosts.length === 1) {
      navigate(`/post/${dayPosts[0].id}`);
    } else {
      setDayPickerPosts(dayPosts);
    }
  }

  return (
    <>
      <div className="calendar-grid">
        {Array.from({ length: 12 }, (_, month) => {
          const days = getDaysInMonth(year, month);
          const firstDay = getFirstDayOfMonth(year, month);

          return (
            <div key={month} className="calendar-month">
              <div className="calendar-month-title">{MONTH_ABBR[month]}</div>
              <div className="calendar-weekdays">
                {WEEKDAYS.map((d) => <span key={d}>{d}</span>)}
              </div>
              <div className="calendar-days">
                {Array.from({ length: firstDay }, (_, i) => (
                  <span key={`e-${i}`} className="calendar-day" />
                ))}
                {Array.from({ length: days }, (_, i) => {
                  const day = i + 1;
                  const key = `${year}-${month}-${day}`;
                  const dayPosts = postMap[key];
                  const hasPosts = Boolean(dayPosts && dayPosts.length > 0);
                  const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
                  const hoverKey = `${month}-${day}`;

                  return (
                    <span
                      key={day}
                      className={`calendar-day ${hasPosts ? 'has-post' : ''} ${isToday && !hasPosts ? 'today' : ''}`}
                      onMouseEnter={() => hasPosts && setHoveredDay(hoverKey)}
                      onMouseLeave={() => setHoveredDay(null)}
                      onClick={() => handleDayClick(dayPosts)}
                      style={{ position: 'relative' }}
                    >
                      {day}
                      {hoveredDay === hoverKey && hasPosts && (
                        <span className="calendar-tooltip">
                          {dayPosts.map((p) => (
                            <span key={p.id} className="calendar-tooltip-item">
                              {p.title}
                            </span>
                          ))}
                        </span>
                      )}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {dayPickerPosts && (
        <div className="modal-overlay" onClick={() => setDayPickerPosts(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Entries on this date</h3>
            <div className="calendar-day-picker-list">
              {dayPickerPosts.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="calendar-day-picker-item"
                  onClick={() => navigate(`/post/${item.id}`)}
                >
                  {item.title}
                </button>
              ))}
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setDayPickerPosts(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
