import React, { useState } from "react";
import axios from "axios";
import SERVER_URL from "../../../config/api";
import "./addRoom.css";

const AddRoom = () => {
  const [roomNo, setRoomNo] = useState("");
  const [coordinates, setCoordinates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

  const handleAddCoordinate = () => {
    if (coordinates.length >= 4) {
      setMessage({ type: "error", text: "You can only add 4 coordinates." });
      return;
    }

    if (!navigator.geolocation) {
      setMessage({ type: "error", text: "Geolocation is not supported by your browser." });
      return;
    }

    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        // Round to 6 decimal places (~0.11m precision) instead of 12
        const lat = Number(position.coords.latitude.toFixed(6));
        const long = Number(position.coords.longitude.toFixed(6));

        // Add timestamp check to prevent duplicates
        const newCoordinate = {
          lat,
          long,
          timestamp: position.timestamp
        };

        // Check if coordinates actually changed
        const lastCoord = coordinates[coordinates.length - 1];
        if (!lastCoord ||
          lastCoord.lat !== lat ||
          lastCoord.long !== long) {
          setCoordinates([...coordinates, newCoordinate]);
          setMessage({ type: "success", text: "New coordinate captured!" });
        } else {
          setMessage({ type: "info", text: "Same location detected" });
        }
        setLoading(false);
      },
      (error) => {
        console.error("Geolocation error:", error);
        setLoading(false);
        setMessage({
          type: "error",
          text: `Location failed: ${error.message} - ${getErrorDetail(error.code)}`
        });
      },
      // Add precision configuration
      {
        enableHighAccuracy: true, // Force GPS when available
        maximumAge: 0, // No cached positions
        timeout: 10000 // 10-second timeout
      }
    );

    // Helper for better error messages
    const getErrorDetail = (code) => {
      switch (code) {
        case 1: return "Permission denied";
        case 2: return "Position unavailable";
        case 3: return "Timeout reached";
        default: return "Unknown error";
      }
    };
  };

  const handleSubmit = async () => {
    if (!roomNo || coordinates.length !== 4) {
      setMessage({ type: "error", text: "Please enter a room number and ensure 4 coordinates are added." });
      return;
    }

    try {
      await axios.post(`${SERVER_URL}/admin/addRoom`, { roomNo, coordinates });
      setMessage({ type: "success", text: "Room data added successfully!" });
      setRoomNo("");
      setCoordinates([]);
    } catch (error) {
      console.error("Error adding room data:", error);
      setMessage({ type: "error", text: "Failed to add room data." });
    }
  };

  return (
    <div className="app-container">
      <div className="form-container">
        <h2 className="form-title">Room Data Entry</h2>

        {message.text && (
          <div className={`message ${message.type}`}>
            {message.text}
          </div>
        )}

        <input
          type="text"
          placeholder="Enter Room Number"
          value={roomNo}
          onChange={(e) => setRoomNo(e.target.value)}
          className="input-field"
        />

        <button
          onClick={handleAddCoordinate}
          disabled={coordinates.length >= 4 || loading}
          className={`btn-primary ${coordinates.length >= 4 || loading ? 'disabled' : ''}`}
        >
          {loading ? "Fetching Location..." : "Capture Current Location"}
        </button>

        <h3 className="coordinates-title">Coordinates ({coordinates.length}/4)</h3>
        <ul className="coordinates-list">
          {coordinates.map((c, index) => (
            <li key={index} className="coordinate-item">
              <span className="marker">📍</span>
              Lat: {c.lat}, Long: {c.long}
            </li>
          ))}
        </ul>

        <button
          onClick={handleSubmit}
          disabled={coordinates.length !== 4}
          className={`btn-submit ${coordinates.length === 4 ? 'active' : 'disabled'}`}
        >
          Submit
        </button>
      </div>
    </div>
  );
};

export default AddRoom;
