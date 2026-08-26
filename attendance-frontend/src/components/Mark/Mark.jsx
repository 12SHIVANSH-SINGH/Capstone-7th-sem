import React, { useState } from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import { FaFingerprint } from "react-icons/fa";
import axios from "axios";
import SERVER_URL from "../../config/api";
import "./Mark.css";


const Mark = () => {
  const [uniqueNumber, setUniqueNumber] = useState("");

  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleInputChange = (e) => {
    const value = e.target.value;
    if (/^\d{0,6}$/.test(value)) {
      setUniqueNumber(value);
    }
  };


  const handleMarkAttendance = async () => {
    // if (!email.trim()) {
    //   setMessage("Please enter a valid email.");
    //   return;
    // }
    if (uniqueNumber.length !== 6) {
      setMessage("Please enter a valid 6-digit number.");
      return;
    }

    setIsLoading(true);
    setMessage("");

    try {
      const userDetails = await axios.get(`${SERVER_URL}/islogin`, { withCredentials: true });
      console.log(userDetails);
      const email = userDetails.data.user.email;
      console.log(email)
      // 1. Get WebAuthn challenge from server
      const initResponse = await fetch(
        `${SERVER_URL}/init-auth?email=${email}`,
        {
          credentials: "include",
        }
      );

      const options = await initResponse.json();
      if (!initResponse.ok) {
        setMessage(options.error || "Failed to get authentication challenge.");
        setIsLoading(false);
        return;
      }

      // 2. Get passkey authentication data
      const authJSON = await startAuthentication(options);

      // 3. Verify passkey with server
      const verifyResponse = await fetch(`${SERVER_URL}/verify-auth`, {
        credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...authJSON,
          uniqueNumber,
          email,
        }),
      });

      const verifyData = await verifyResponse.json();
      setIsLoading(false);

      if (!verifyResponse.ok) {
        setMessage(verifyData.error || "Failed to verify authentication.");
        return;
      }

      if (verifyData.success) {


        // 4. Get geolocation and validate room
        const getLocation = async () => {
          if (!navigator.geolocation) {
            alert("Geolocation is not supported by your browser.");
            return;
          }

          try {
            const getPosition = (options = {}) => new Promise((resolve, reject) => {
              navigator.geolocation.getCurrentPosition(
                resolve,
                reject,
                {
                  enableHighAccuracy: true,
                  maximumAge: 0,
                  timeout: 10000,
                  ...options
                }
              );
            });

            const position = await getPosition();

            // Process coordinates
            const lat = Number(position.coords.latitude.toFixed(6));
            const long = Number(position.coords.longitude.toFixed(6));
            console.log("lat=", lat, ",long=", long);

            const details = await axios.post(`${SERVER_URL}/getCode`, { uniqueNumber });
            const roomNo = details.data.data.room;
            console.log(roomNo);
            const response = await axios.post(`${SERVER_URL}/getRoom`, { roomNo });
            const { cor1_lat, cor2_lat, cor3_lat, cor4_lat, cor1_long, cor2_long, cor3_long, cor4_long } = response.data.room;

            // console.log(response.data.room);

            // Calculate the boundary values
            const minLat = Math.min(cor1_lat, cor2_lat, cor3_lat, cor4_lat);
            const maxLat = Math.max(cor1_lat, cor2_lat, cor3_lat, cor4_lat);
            const minLong = Math.min(cor1_long, cor2_long, cor3_long, cor4_long);
            const maxLong = Math.max(cor1_long, cor2_long, cor3_long, cor4_long);
            console.log(minLat, " ", maxLat);
            console.log(minLong, " ", maxLong);
            // Check if the point is inside the rectangle
            const isInsideRoom =
              lat >= minLat && lat <= maxLat && long >= minLong && long <= maxLong;
            if (isInsideRoom) {
              setMessage(`✅ Attendance marked successfully!`);
            } else {
              setMessage(`❌ Trying to make a proxy!`);
            }
          } catch (error) {
            console.error("Error getting location:", error);
            setMessage(error.response.data.message)
          }
        };

        await getLocation();
      } else {
        setMessage(`❌ Failed to mark attendance.`);
      }
    } catch (error) {
      setMessage("Something went wrong during authentication.");
      console.error("WebAuthn Error:", error);
      setIsLoading(false);
    }
  };

  return (
    <div className="global">
      <div className="mark-container">
        <h2>📌 Mark Attendance</h2>

        {/* Email Input */}
        {/* <div className="input-container">
          <input
            type="email"
            placeholder="Enter Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input-box"
            required
          />
        </div> */}

        {/* Unique Number Input */}
        <div className="input-container">
          <FaFingerprint className="input-icon" />
          <input
            type="text"
            placeholder="Enter 6-digit unique code"
            value={uniqueNumber}
            onChange={handleInputChange}
            maxLength="6"
            className="input-box"
          />
        </div>



        {/* Submit Button */}
        <button
          onClick={handleMarkAttendance}
          disabled={uniqueNumber.length !== 6 || isLoading}
          className="mark-btn"
        >
          {isLoading ? "Authenticating..." : "Mark Attendance"}
        </button>

        {/* Display Message */}
        {message && (
          <p
            className={`message ${message.includes("✅") ? "success" : "error"
              }`}
          >
            {message}
          </p>
        )}
      </div>
    </div>
  );
};

export default Mark;
