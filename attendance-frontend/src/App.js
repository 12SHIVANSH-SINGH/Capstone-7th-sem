import React from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './ui/ui.css';
import './ui/pages.css';
import { ToastProvider } from './ui/Toast';
import Home from './components/Home';
import NotFound from './components/NotFound';
import Login from './components/login/Login';
import StudentDashboard from './components/student/studentDashboard';
import StudentCheckIn from './components/student/studentCheckIn';
import TeacherDashboard from './components/teacher/teacherDashboard';
import ClassManagement from './components/teacher/classManagement';
import CheckInSessions from './components/teacher/checkInSessions';
import AttendanceAnalytics from './components/attendance/AttendanceAnalytics';
import QueryCenter from './components/queries/QueryCenter';
import ExportCenter from './components/exports/ExportCenter';
import SessionHistory from './components/sessions/SessionHistory';
import AdminPanel from './components/admin/AdminPanel';
import Notifications from './components/notifications/Notifications';
import Profile from './components/profile/Profile';
import Timetable from './components/timetable/Timetable';
import Help from './components/help/Help';
import AcousticLab from './components/acousticLab/AcousticLab';
import AcousticTransmit from './components/acousticLab/AcousticTransmit';
import AcousticReceive from './components/acousticLab/AcousticReceive';

function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <Routes>
          <Route path={'/'} element={<Home />} />
          <Route path={'/login'} element={<Login />} />
          <Route path='/teacher/classes' element={<ClassManagement />} />
          <Route path='/teacher/check-in' element={<CheckInSessions />} />
          <Route path='/teacher/sessions' element={<SessionHistory />} />
          <Route path='/attendance' element={<AttendanceAnalytics />} />
          <Route path='/queries' element={<QueryCenter />} />
          <Route path='/exports' element={<ExportCenter />} />
          <Route path='/admin' element={<AdminPanel />} />
          <Route path='/notifications' element={<Notifications />} />
          <Route path='/profile' element={<Profile />} />
          <Route path='/timetable' element={<Timetable />} />
          <Route path='/help' element={<Help />} />
          <Route path='/acoustic-lab' element={<AcousticLab />} />
          <Route path='/acoustic-tx' element={<AcousticTransmit />} />
          <Route path='/acoustic-rx' element={<AcousticReceive />} />
          <Route path={'/student-dashboard'} element={<StudentDashboard />} />
          <Route path={'/student/check-in'} element={<StudentCheckIn />} />
          <Route path={'/teacher-dashboard'} element={<TeacherDashboard />} />
          <Route path='*' element={<NotFound />} />
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  );
}

export default App;
