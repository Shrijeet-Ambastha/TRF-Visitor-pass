async function loadApprovedVisitors() {
  try {
    const res = await fetch("/api/visitors");
    const visitors = await res.json();

    const tbody = document.querySelector("#visitorTable tbody");
    tbody.innerHTML = "";

    visitors
      .filter(v => v.status === "approved")
      .forEach(visitor => {
        const row = document.createElement("tr");
        row.innerHTML = `
          <td>${visitor.passNumber}</td>
          <td>${visitor.name}</td>
          <td>${visitor.visitDate}</td>
          <td>${visitor.purpose}</td>
          <td>
            <a href="/api/download-pass/${visitor._id}" target="_blank">
              <button>Print PDF</button>
            </a>
          </td>
        `;
        tbody.appendChild(row);
      });
  } catch (err) {
    console.error("Error loading approved visitors:", err);
  }
}
