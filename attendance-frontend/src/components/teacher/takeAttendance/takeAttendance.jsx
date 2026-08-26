
// import React, { useState, useEffect } from 'react';
// import axios from 'axios';
// import './takeAttendance.css';

// const TakeAttendance = () => {
//   const [formData, setFormData] = useState({
//     batch: '',
//     year: '',
//     course: '',
//     room: ''
//   });
//   const [generatedCode, setGeneratedCode] = useState('');
//   const [expiration, setExpiration] = useState(null);
//   // const [remainingTime, setRemainingTime] = useState(600);
//   const [loading, setLoading] = useState(false);
//   const [error, setError] = useState('');

//   useEffect(() => {
//     let interval;
//     if (expiration) {
//       interval = setInterval(() => {
//         const timeLeft = Math.round((expiration - Date.now()) / 1000);
//         setRemainingTime(timeLeft > 0 ? timeLeft : 0);

//         if (timeLeft <= 0) {
//           setGeneratedCode('');
//           clearInterval(interval);
//         }
//       }, 1000);
//     }
//     return () => clearInterval(interval);
//   }, [expiration]);
//   const generateCode = () => {
//     const code = Math.floor(100000 + Math.random() * 900000);
//     return code.toString().substring(0, 6);
//   };
//   const handleSubmit = async (e) => {
//     e.preventDefault();
//     setError('');
//     setLoading(true);

//     try {
//       const newCode = generateCode();
//       const expirationTime = Date.now() + 600000; // 10 minutes


//       setGeneratedCode(newCode);
//       setExpiration(expirationTime);
//       setRemainingTime(600);
//     } catch (err) {
//       setError(err.response?.data?.message || 'Failed to generate code');
//     } finally {
//       setLoading(false);
//     }
//   };

//   const formatTime = (seconds) => {
//     const mins = Math.floor(seconds / 60);
//     const secs = seconds % 60;
//     return `${mins}:${secs.toString().padStart(2, '0')}`;
//   };

//   return (
//     <div className="attendance-container">
//       <div className="attendance-card">
//         <h2>Generate Attendance Code</h2>

//         <form onSubmit={handleSubmit}>
//           <div className="form-group">
//             <label>Batch</label>
//             <input
//               type="text"
//               value={formData.batch}
//               onChange={(e) => setFormData({...formData, batch: e.target.value})}
//               required
//             />
//           </div>

//           <div className="form-group">
//             <label>Branch</label>
//             <select
//               value={formData.year}
//               onChange={(e) => setFormData({...formData, year: e.target.value})}
//               required
//             >
//               <option value="">Select Branch</option>
//               <option value="CSE">CSE</option>
//               <option value="EE">EE</option>
//               <option value="ECE">ECE</option>
//               <option value="CE">CE</option>
//               <option value="ME">ME</option>
//               <option value="MME">MME</option>
//               <option value="ECM">ECM</option>
//               <option value="PIE">PIE</option>
//             </select>
//           </div>

//           <div className="form-group">
//             <label>Course Code</label>
//             <input
//               type="text"
//               value={formData.course}
//               onChange={(e) => setFormData({...formData, course: e.target.value})}
//               required
//             />
//           </div>

//           <div className="form-group">
//             <label>Room</label>
//             <input
//               type="text"
//               value={formData.room}
//               onChange={(e) => setFormData({...formData, room: e.target.value})}
//               required
//             />
//           </div>

//           {error && <div className="error-message">{error}</div>}

//           <button 
//             type="submit" 
//             className="generate-btn"
//             disabled={loading}
//           >
//             {loading ? 'Generating...' : 'Generate Code'}
//           </button>
//         </form>

//         {generatedCode && (
//           <div className="code-display">
//             <h3>Attendance Code</h3>
//             <div className="code-box">{generatedCode}</div>
//             {/* <div className="timer">
//               Expires in: {formatTime(remainingTime)}
//             </div> */}
//             <p className="instruction">
//               Share this code with students.
//             </p>
//           </div>
//         )}
//       </div>
//     </div>
//   );
// };

// export default TakeAttendance;

import React, { useState } from 'react';
import axios from 'axios';
import SERVER_URL from '../../../config/api';
import './takeAttendance.css';

const TakeAttendance = () => {
  const [formData, setFormData] = useState({
    batch: '',
    year: '',
    course: '',
    room: ''
  });
  const [generatedCode, setGeneratedCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await axios.post(`${SERVER_URL}/genCode`, formData);
      setGeneratedCode(response.data.code);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to generate code');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    try {
      await axios.post(`${SERVER_URL}/deleteCode`, { generatedCode });
      setGeneratedCode('');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete code');
    }
  };

  return (
    <div className="attendance-container">
      <div className="attendance-card">
        <h2>Generate Attendance Code</h2>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Batch</label>
            <input
              type="text"
              value={formData.batch}
              onChange={(e) => setFormData({ ...formData, batch: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label>Branch</label>
            <select
              value={formData.year}
              onChange={(e) => setFormData({ ...formData, year: e.target.value })}
              required
            >
              <option value="">Select Branch</option>
              <option value="CSE">CSE</option>
              <option value="EE">EE</option>
              <option value="ECE">ECE</option>
              <option value="CE">CE</option>
              <option value="ME">ME</option>
              <option value="MME">MME</option>
              <option value="ECM">ECM</option>
              <option value="PIE">PIE</option>
            </select>
          </div>

          <div className="form-group">
            <label>Course Code</label>
            <input
              type="text"
              value={formData.course}
              onChange={(e) => setFormData({ ...formData, course: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label>Room</label>
            <input
              type="text"
              value={formData.room}
              onChange={(e) => setFormData({ ...formData, room: e.target.value })}
              required
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button
            type="submit"
            className="generate-btn"
            disabled={loading || generatedCode}
          >
            {loading ? 'Generating...' : 'Generate Code'}
          </button>
        </form>

        {generatedCode && (
          <div className="code-display">
            <h3>Attendance Code</h3>
            <div className="code-box">{generatedCode}</div>
            <button
              onClick={handleDelete}
              className="generate-btn"
            >
              Delete Code
            </button>
            <p className="instruction">
              Share this code with students.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TakeAttendance;
