require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const PDFDocument = require("pdfkit");
const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const nodemailer = require("nodemailer");

const app = express();
const PORT = 3000;

// ✅ MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch(err => console.error("❌ MongoDB connection error:", err));

// ✅ Visitor Schema
const visitorSchema = new mongoose.Schema({
  passNumber: String,
  name: String,
  email: String,
  phone: String,
  visitDate: String,
  visitTime: String,     // NEW
endTime: String,       // NEW

  host: String,
  hostEmail: String,
  purpose: String,
  photoData: String,
  personType: String,           // NEW
  visitArea: String,            // NEW
  ppe: String,                  // NEW
  govtIdType: String,           // NEW
  govtIdNumber: String,         // NEW
  laptopNo: String,             // NEW
  vehicleNo: String,            // NEW
  status: { type: String, default: "pending" },
  issuedAt: { type: Date, default: Date.now }
});



const Visitor = mongoose.model("Visitor", visitorSchema);

app.use(bodyParser.json({ limit: "5mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "5mb" }));

// ✅ Serve login.html explicitly at root
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "frontend", "login.html"));
});

// ✅ Serve all static files (index.html, guard.html, etc.)
app.use(express.static(path.join(__dirname, "..", "frontend")));

// ✅ Visitor Request API
app.post("/api/request-pass", async (req, res) => {
  const {
  name, email, phone, visitDate, visitTime, endTime,
  host, hostEmail, purpose, photoData,
  personType, visitArea, ppe,
  govtIdType, govtIdNumber, laptopNo, vehicleNo
} = req.body;

  const passNumber = `TRF-${Math.floor(100000 + Math.random() * 900000)}`;

  try {
    const visitor = await Visitor.create({
  passNumber, name, email, phone, visitDate, visitTime, endTime,
  host, hostEmail, purpose, photoData,
  personType, visitArea, ppe,
  govtIdType, govtIdNumber, laptopNo, vehicleNo
});
    const approvalLink = `https://trf-visitor-pass.onrender.com/api/approve/${visitor._id}`;
    const rejectionLink = `https://trf-visitor-pass.onrender.com/api/reject/${visitor._id}`;

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: hostEmail,
      subject: `Approval Needed - ${passNumber}`,
      html: `
        <p>Hello ${host},</p>
        <p>${name} has requested a visit on ${visitDate}.</p>
        <p><strong>Purpose:</strong> ${purpose}</p>
        <p><a href="${approvalLink}">✅ Click here to approve</a></p>
        <p><a href="${rejectionLink}">❌ Click here to reject</a></p>
      `
    });

    res.status(200).json({ message: "✅ Request submitted. Awaiting host approval." });
  } catch (err) {
    console.error("❌ Failed to process request:", err);
    res.status(500).send("Error processing visitor request");
  }
});

// ✅ Approve Visitor
app.get("/api/approve/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const visitor = await Visitor.findById(id);
    if (!visitor) return res.status(404).send("Visitor request not found");
    if (visitor.status === "approved") return res.send("Already approved");

    visitor.status = "approved";
    await visitor.save();

    const doc = new PDFDocument();
    const buffers = [];
    doc.on("data", buffers.push.bind(buffers));
    doc.on("end", async () => {
      const pdfBuffer = Buffer.concat(buffers);

      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        }
      });

      const attachment = {
        filename: "visitor-pass.pdf",
        content: pdfBuffer,
        contentType: "application/pdf"
      };

      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: visitor.email,
        subject: `TRF Visitor Pass - ${visitor.passNumber}`,
        text: `Your visit is approved. Please find your pass ${visitor.passNumber} attached.`,
        attachments: [attachment]
      });

      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: visitor.hostEmail,
        subject: `Visitor Pass for ${visitor.name}`,
        text: `${visitor.name} has been approved. PDF attached.`,
        attachments: [attachment]
      });

      res.send("✅ Approved. PDF sent to visitor and host.");
    });

    // Generate Pass PDF
    const bgPath = path.join(__dirname, "background.png");
    if (fs.existsSync(bgPath)) {
      doc.image(bgPath, 0, 0, {
        width: doc.page.width,
        height: doc.page.height
      });
    }

    const logoPath = path.join(__dirname, "trf.png");
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, { fit: [130, 130], align: "center" });
      doc.moveDown(0.5);
    }

    doc.fontSize(20).fillColor("#004080").text("TRF Ltd", { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(26).text("Visitor E-Pass", { align: "center" });
    doc.moveDown(1);

    doc.fontSize(16).fillColor("black");
    doc.text(`Pass No: ${visitor.passNumber}`);
    doc.text(`Name: ${visitor.name}`);
    doc.text(`Email: ${visitor.email}`);
    doc.text(`Phone: ${visitor.phone}`);
    doc.text(`Visit Date: ${visitor.visitDate}`);
    doc.text(`Visit Time: ${visitor.visitTime || "N/A"}`);
doc.text(`End Time: ${visitor.endTime || "N/A"}`);
    doc.text(`Host: ${visitor.host}`);
    doc.text(`Type of Person: ${visitor.personType || "N/A"}`);
doc.text(`Area of Visit: ${visitor.visitArea || "N/A"}`);
doc.text(`PPE Required: ${visitor.ppe || "N/A"}`);
doc.text(`Govt ID: ${visitor.govtIdType || "N/A"} - ${visitor.govtIdNumber || ""}`);
doc.text(`Laptop No: ${visitor.laptopNo || "N/A"}`);
doc.text(`Vehicle No: ${visitor.vehicleNo || "N/A"}`);

    doc.text(`Purpose: ${visitor.purpose}`);
    doc.moveDown(1);

    if (visitor.photoData?.startsWith("data:image")) {
      const buffer = Buffer.from(visitor.photoData.split(",")[1], "base64");
      doc.image(buffer, { width: 180, align: "center" });
    }
// Instructions Section
doc.moveDown(1);
doc.fontSize(14).fillColor("#000").text("Instructions :", { underline: true });
doc.fontSize(11).fillColor("black");

const instructions = [
  "You are not allowed to work inside plant with this Pass.",
  "Please fold the paper from middle to 2 parts as marked in dotted line.",
  "Pass is valid for specified date and time.",
  "Pass is non-transferable and to be used only for declared purpose.",
  "Person below 18 years of age are not allowed inside the project sites.",
  "Photo/video-graphy inside official premises is prohibited.",
  "Visitor is responsible for his own safety and belongings inside the site.",
  "Concerned contact person would arrange the PPE’s for visitor and brief on safety rules.",
  "Contact person would counter sign the visitor’s Pass at the end of the visit.",
  "Pass needs to be returned to security personnel at the gate while exiting.",
  "Any material /document required to be taken inside the plant must be declared and subject to appropriate approval at the gate."
];

instructions.forEach(i => doc.text(`• ${i}`));

// Validity & Signatures
doc.moveDown(1);
doc.font("Helvetica-Bold").text(`* This pass is valid for ${visitor.visitDate} Trf Ltd`, { italics: true });

doc.moveDown(2);
doc.font("Helvetica").text("Visitor Signature", { continued: true, align: "left" });
doc.text("Host Signature", { align: "right" });

    doc.end();
  } catch (err) {
    console.error("❌ Error approving visitor:", err);
    res.status(500).send("Error during approval");
  }
});

// ❌ Reject Visitor
app.get("/api/reject/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const visitor = await Visitor.findById(id);
    if (!visitor) return res.status(404).send("Visitor not found");
    if (visitor.status === "approved") return res.send("Already approved");
    if (visitor.status === "rejected") return res.send("Already rejected");

    visitor.status = "rejected";
    await visitor.save();

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: visitor.email,
      subject: "TRF Visitor Pass Rejected",
      text: `Hello ${visitor.name},\n\nYour visitor request has been rejected by the host (${visitor.host}).`
    });

    res.send("❌ Rejected. Notification sent to visitor.");
  } catch (err) {
    console.error("❌ Rejection error:", err);
    res.status(500).send("Error rejecting visitor");
  }
});

// ✅ Download Pass for Guard
app.get("/api/download-pass/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const visitor = await Visitor.findById(id);
    if (!visitor || visitor.status !== "approved") {
      return res.status(404).send("Pass not found or not approved");
    }

    const doc = new PDFDocument();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename=${visitor.passNumber}.pdf`);
    doc.pipe(res);

     const bgPath = path.join(__dirname, "background.png");
    if (fs.existsSync(bgPath)) {
      try {
        doc.image(bgPath, 0, 0, {
          width: doc.page.width,
          height: doc.page.height
        });
      } catch (err) {
        console.error("❌ Background image error:", err.message);
      }
    }

    const logoPath = path.join(__dirname, "trf.png");
    if (fs.existsSync(logoPath)) doc.image(logoPath, { fit: [100, 100] });

    doc.fontSize(18).text("TRF Ltd", { align: "center" });
    doc.moveDown();
    doc.fontSize(22).text("Visitor E-Pass", { align: "center" });
    doc.moveDown();
    doc.fontSize(14);
    doc.text(`Pass No: ${visitor.passNumber}`);
    doc.text(`Name: ${visitor.name}`);
    doc.text(`Email: ${visitor.email}`);
    doc.text(`Phone: ${visitor.phone}`);
    doc.text(`Visit Date: ${visitor.visitDate}`);
    doc.text(`Host: ${visitor.host}`);
    doc.text(`Type of Person: ${visitor.personType || "N/A"}`);
doc.text(`Area of Visit: ${visitor.visitArea || "N/A"}`);
doc.text(`PPE Required: ${visitor.ppe || "N/A"}`);
doc.text(`Govt ID: ${visitor.govtIdType || "N/A"} - ${visitor.govtIdNumber || ""}`);
doc.text(`Laptop No: ${visitor.laptopNo || "N/A"}`);
doc.text(`Vehicle No: ${visitor.vehicleNo || "N/A"}`);

    doc.text(`Purpose: ${visitor.purpose}`);

    if (visitor.photoData?.startsWith("data:image")) {
      const buffer = Buffer.from(visitor.photoData.split(",")[1], "base64");
      doc.image(buffer, { width: 120 });
    }

// Instructions Section
doc.moveDown(1);
doc.fontSize(14).fillColor("#000").text("Instructions :", { underline: true });
doc.fontSize(11).fillColor("black");

const instructions = [
  "You are not allowed to work inside plant with this Pass.",
  "Please fold the paper from middle to 2 parts as marked in dotted line.",
  "Pass is valid for specified date and time.",
  "Pass is non-transferable and to be used only for declared purpose.",
  "Person below 18 years of age are not allowed inside the project sites.",
  "Photo/video-graphy inside official premises is prohibited.",
  "Visitor is responsible for his own safety and belongings inside the site.",
  "Concerned contact person would arrange the PPE’s for visitor and brief on safety rules.",
  "Contact person would counter sign the visitor’s Pass at the end of the visit.",
  "Pass needs to be returned to security personnel at the gate while exiting.",
  "Any material /document required to be taken inside the plant must be declared and subject to appropriate approval at the gate."
];

instructions.forEach(i => doc.text(`• ${i}`));

// Validity & Signatures
doc.moveDown(1);
doc.font("Helvetica-Bold").text(`* This pass is valid for ${visitor.visitDate} Trf Ltd`, { italics: true });

doc.moveDown(2);
doc.font("Helvetica").text("Visitor Signature", { continued: true, align: "left" });
doc.text("Host Signature", { align: "right" });


    doc.end();
  } catch (err) {
    console.error("❌ Error generating PDF:", err);
    res.status(500).send("Failed to generate pass");
  }
});

// ✅ All Visitors (Used by guard panel)
app.get("/api/visitors", async (req, res) => {
  try {
    const visitors = await Visitor.find().sort({ issuedAt: -1 });
    res.json(visitors);
  } catch (err) {
    console.error("❌ Fetch error:", err);
    res.status(500).send("Failed to retrieve visitors");
  }
});

// ✅ Cleanup old records
app.delete("/api/cleanup-old-visitors", async (req, res) => {
  const days = 45;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  try {
    const result = await Visitor.deleteMany({ issuedAt: { $lt: cutoff } });
    res.send(`🧹 Deleted ${result.deletedCount} visitor(s) older than ${days} days.`);
  } catch (err) {
    console.error("❌ Cleanup error:", err);
    res.status(500).send("Cleanup failed");
  }
});

// ✅ Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
