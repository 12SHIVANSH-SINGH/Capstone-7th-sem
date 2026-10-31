import React from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './ui/ui.css';
import { ToastProvider } from './ui/Toast';
import Home from './components/Home';
import NotFound from './components/NotFound';
import Login from './components/login/Login';
import StudentDashboard from './components/student/studentDashboard';
import StudentCheckIn from './components/student/studentCheckIn';
import TeacherDashboard from './components/teacher/teacherDashboard';
import ClassManagement from './components/teacher/classManagement';
import CheckInSessions from './components/teacher/checkInSessions';
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
