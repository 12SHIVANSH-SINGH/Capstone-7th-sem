import React from 'react';
import Home from './components/Home';
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { createContext } from 'react';
import Login from './components/login/Login';
import Register from './components/login/Register';
import Mark from './components/Mark/Mark';
import StudentDashboard from './components/student/studentDashboard';
import TeacherDashboard from './components/teacher/teacherDashboard';
import AddRoom from './components/teacher/addRoom/addRoom';
import TakeAttendance from './components/teacher/takeAttendance/takeAttendance';
export const usercontext = createContext(null);
function App() {
  return (
    <BrowserRouter>
          <Routes>
            <Route path={'/'} element={<Home />}></Route>
            <Route path={'/login'} element={<Login/>}></Route>
            <Route path={'/register'} element={<Register/>}></Route>
            <Route path='/admin/addRoom' element={<AddRoom/>}></Route>
            <Route path='/admin/takeAttendance' element={<TakeAttendance/>}></Route>
            <Route path={'/markAttendance'} element={<Mark/>}></Route>
            <Route path={'/student-dashboard'} element={<StudentDashboard/>}></Route>
            <Route path={'/teacher-dashboard'} element={<TeacherDashboard/>}></Route>
          </Routes>
    </BrowserRouter>
  );
}

export default App;
