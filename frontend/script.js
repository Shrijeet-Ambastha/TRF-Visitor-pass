// Access DOM elements
const video = document.getElementById("camera");
const canvas = document.getElementById("snapshot");
const photoDataInput = document.getElementById("photoData");

// 1. Start the webcam
navigator.mediaDevices.getUserMedia({ video: true })
  .then(stream => {
    video.srcObject = stream;
  })
  .catch(err => {
    console.error("Camera access denied:", err);
    alert("Please allow camera access to capture your photo.");
  });

// 2. Handle form submission
document.getElementById("visitorForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;

  // 3. Capture image from webcam into canvas
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const photoDataURL = canvas.toDataURL("image/png"); // base64 encoded
  photoDataInput.value = photoDataURL;

  // 4. Prepare form data to send
  const data = {
    name: form.name.value,
    email: form.email.value,
    phone: form.phone.value,
    visitDate: form.visitDate.value,
    host: form.host.value,
    hostEmail: form.hostEmail.value,
    purpose: form.purpose.value,
    photoData: photoDataInput.value
  };

  try {
    const res = await fetch("/api/request-pass", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    const result = await res.json();
    if (res.ok) {
      alert("✅ Request submitted! Awaiting host approval.");
      form.reset();
    } else {
      alert("❌ Failed to submit request.");
    }
  } catch (error) {
    console.error("Submission error:", error);
    alert("❌ Something went wrong. Please try again.");
  }
});
