document.addEventListener("DOMContentLoaded", async () => {
  const tableBody = document.getElementById("visitorTableBody");

  try {
    const res = await fetch("/api/visitors");
    const visitors = await res.json();

    const approvedVisitors = visitors.filter(v => v.status === "approved");

    if (approvedVisitors.length === 0) {
      tableBody.innerHTML = "<tr><td colspan='4'>No approved passes found.</td></tr>";
      return;
    }

    approvedVisitors.forEach(visitor => {
      const tr = document.createElement("tr");

      const nameTd = document.createElement("td");
      nameTd.textContent = visitor.name;

      const passTd = document.createElement("td");
      passTd.textContent = visitor.passNumber;

      const dateTd = document.createElement("td");
      dateTd.textContent = new Date(visitor.visitDate).toLocaleDateString();

      const actionTd = document.createElement("td");
      const printBtn = document.createElement("button");
      printBtn.textContent = "🖨️ Print Pass";
      printBtn.classList.add("print-button");
      printBtn.onclick = () => {
        window.open(`/api/download-pass/${visitor._id}`, "_blank");
      };
      actionTd.appendChild(printBtn);

      tr.appendChild(nameTd);
      tr.appendChild(passTd);
      tr.appendChild(dateTd);
      tr.appendChild(actionTd);

      tableBody.appendChild(tr);
    });
  } catch (err) {
    console.error("Error loading visitor data:", err);
    tableBody.innerHTML = "<tr><td colspan='4'>Error fetching visitors.</td></tr>";
  }
});
