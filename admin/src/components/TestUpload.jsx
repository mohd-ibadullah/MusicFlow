import React, { useState } from "react";
import axios from "axios";
import { url } from "../App";

const TestUpload = () => {
  const [testResults, setTestResults] = useState({});
  const [loading, setLoading] = useState(false);

  const testBackend = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${url}/api/test`);
      setTestResults(prev => ({ ...prev, basic: response.data }));
      console.log("✅ Basic test:", response.data);
    } catch (error) {
      setTestResults(prev => ({ ...prev, basic: { error: error.message } }));
      console.error("❌ Basic test failed:", error);
    } finally {
      setLoading(false);
    }
  };

  const testUpload = async () => {
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("test", "hello");
      
      const response = await axios.post(`${url}/api/test-upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      setTestResults(prev => ({ ...prev, upload: response.data }));
      console.log("✅ Upload test:", response.data);
    } catch (error) {
      setTestResults(prev => ({ ...prev, upload: { error: error.message } }));
      console.error("❌ Upload test failed:", error);
    } finally {
      setLoading(false);
    }
  };

  const testCloudinary = async () => {
    setLoading(true);
    try {
      // Create a simple 1x1 pixel PNG image
      const base64Image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
      const fetchResponse = await fetch(base64Image); // Renamed to fetchResponse
      const blob = await fetchResponse.blob();
      const testFile = new File([blob], "test.png", { type: "image/png" });
      
      const formData = new FormData();
      formData.append("image", testFile);
      formData.append("name", "Test Album");
      formData.append("desc", "Test Description");
      formData.append("bgColor", "#ffffff");

      const axiosResponse = await axios.post(`${url}/api/album/add`, formData, { // Renamed to axiosResponse
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 30000,
      });
      setTestResults(prev => ({ ...prev, cloudinary: axiosResponse.data }));
      console.log("✅ Cloudinary test:", axiosResponse.data);
    } catch (error) {
      setTestResults(prev => ({ ...prev, cloudinary: { 
        error: error.message,
        response: error.response?.data 
      }}));
      console.error("❌ Cloudinary test failed:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold mb-4">Backend Diagnostics</h2>
      
      <div className="space-y-4 mb-6">
        <button 
          onClick={testBackend}
          disabled={loading}
          className="px-4 py-2 bg-blue-500 text-white rounded mr-2"
        >
          Test Basic API
        </button>
        <button 
          onClick={testUpload}
          disabled={loading}
          className="px-4 py-2 bg-green-500 text-white rounded mr-2"
        >
          Test Upload Endpoint
        </button>
        <button 
          onClick={testCloudinary}
          disabled={loading}
          className="px-4 py-2 bg-purple-500 text-white rounded"
        >
          Test Cloudinary Upload
        </button>
      </div>

      {loading && (
        <div className="text-center py-4">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p>Testing...</p>
        </div>
      )}

      <div className="bg-gray-100 p-4 rounded">
        <h3 className="font-bold mb-2">Test Results:</h3>
        <pre className="text-sm">{JSON.stringify(testResults, null, 2)}</pre>
      </div>

      <div className="mt-6 bg-yellow-50 p-4 rounded border border-yellow-200">
        <h3 className="font-bold text-yellow-800">Current Issue:</h3>
        <p className="text-yellow-700 mt-2">
          <strong>Cloudinary is rejecting the file because it's not a valid image.</strong><br/>
          The test was using a .txt file, but Cloudinary only accepts image files.
        </p>
        <p className="text-green-700 mt-2 font-medium">
          ✅ The fix above uses a real 1x1 pixel PNG image for testing.
        </p>
      </div>
    </div>
  );
};

export default TestUpload;