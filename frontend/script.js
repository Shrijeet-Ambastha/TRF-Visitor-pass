document.getElementById("visitorForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;

  const data = {
    name: form.name.value,
    email: form.email.value,
    phone: form.phone.value,
    visitDate: form.visitDate.value,
    host: form.host.value,
    hostEmail: form.hostEmail.value,
    purpose: form.purpose.value
  };

  const res = await fetch("/api/request-pass", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });

  if (res.ok) {
    const result = await res.json();
    alert("✅ Request submitted! Awaiting host approval.");
    form.reset(); // clear form
  } else {
    alert("❌ Failed to submit request.");
  }
});
