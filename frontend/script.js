document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("visitorForm");
  const video = document.getElementById("camera");
  const canvas = document.getElementById("snapshot");
  const photoInput = document.getElementById("photoData");
  const printBtn = document.getElementById("printBtn");
  const startBtn = document.getElementById("startCamera");
  const laptopSelect = document.getElementById("laptopNoSelect");
  const laptopInput = document.getElementById("laptopNoInput");
  const vehicleSelect = document.getElementById("vehicleNoSelect");
  const vehicleInput = document.getElementById("vehicleNoInput");

  startBtn.addEventListener("click", () => {
    navigator.mediaDevices.getUserMedia({ video: true })
      .then(stream => {
        video.srcObject = stream;
      })
      .catch(err => {
        console.error("Camera access denied:", err);
        alert("Please allow camera access to capture your photo.");
      });
  });

  // Toggle input fields
  function handleLaptopChange() {
    if (laptopSelect.value === "Other") {
      laptopInput.style.display = "block";
    } else {
      laptopInput.style.display = "none";
    }
  }

  function handleVehicleChange() {
    if (vehicleSelect.value === "Other") {
      vehicleInput.style.display = "block";
    } else {
      vehicleInput.style.display = "none";
    }
  }

  laptopSelect.addEventListener("change", handleLaptopChange);
  vehicleSelect.addEventListener("change", handleVehicleChange);

  // Initial check
  handleLaptopChange();
  handleVehicleChange();

  // Form submission
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    // Capture webcam image
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const photoDataURL = canvas.toDataURL("image/png");
    photoInput.value = photoDataURL;

    // Prepare form data
    const data = {
      name: form.name.value,
      email: form.email.value,
      phone: form.phone.value,
      visitDate: form.visitDate.value,
      visitTime: form.visitTime.value,
      endTime: form.endTime.value,
      host: form.host.value,
      hostEmail: form.hostEmail.value,
      purpose: form.purpose.value,
      photoData: photoInput.value,
      personType: form.personType.value,
      visitArea: form.visitArea.value,
      ppe: form.ppe.value,
      govtIdType: form.govtIdType.value,
      govtIdNumber: form.govtIdNumber.value,
      laptopNo: laptopSelect.value === "Other" ? laptopInput.value : laptopSelect.value,
      vehicleNo: vehicleSelect.value === "Other" ? vehicleInput.value : vehicleSelect.value
    };

    try {
      const response = await fetch("/api/request-pass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });

      if (response.ok) {
        const result = await response.json();
        alert(result.message || "✅ Request submitted successfully.");
        form.reset();
        printBtn.style.display = "inline-block";
        printBtn.onclick = () => window.print();
      } else {
        alert("❌ Submission failed.");
      }
    } catch (err) {
      console.error("Submission Error:", err);
      alert("❌ Error occurred during submission.");
    }
  });
});
