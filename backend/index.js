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
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// ✅ Visitor Schema
const visitorSchema = new mongoose.Schema({
  passNumber: String,
  name: String,
  email: String,
  phone: String,
  visitDate: String,
  host: String,
  hostEmail: String,
  purpose: String,
  photoData: String,
  status: { type: String, default: "pending" },
  issuedAt: { type: Date, default: Date.now }
});

const Visitor = mongoose.model("Visitor", visitorSchema);

app.use(bodyParser.json({ limit: '5mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '5mb' }));

// ✅ Serve login.html explicitly for root URL (IMPORTANT)
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "frontend", "login.html"));
});

// ✅ Serve all other static files (like index.html, guard.html, etc.)
app.use(express.static(path.join(__dirname, "..", "frontend")));

// ✅ Reusable PDF Generator Function
const generateVisitorPassPDF = (visitor, stream) => {
  const doc = new PDFDocument();
  doc.pipe(stream);

  const bgPath = path.join(__dirname, "background.png");
  if (fs.existsSync(bgPath)) {
    doc.image(bgPath, 0, 0, {
      width: doc.page.width,
      height: doc.page.height
    });
  }

  const logoPath = path.join(__dirname, "trf.png");
  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, 60, 40, { fit: [80, 80] });
  }

  doc.moveDown(3);
  doc.fontSize(20).fillColor("#004080").text("TRF Ltd", { align: "center" });
  doc.fontSize(26).fillColor("#004080").text("Visitor E-Pass", { align: "center" });
  doc.moveDown(1);
  doc.fillColor("black").fontSize(14);
  doc.text(`Pass No: ${visitor.passNumber}`);
  doc.text(`Name: ${visitor.name}`);
  doc.text(`Email: ${visitor.email}`);
  doc.text(`Phone: ${visitor.phone}`);
  doc.text(`Visit Date: ${visitor.visitDate}`);
  doc.text(`Host: ${visitor.host}`);
  doc.text(`Purpose: ${visitor.purpose}`);
  doc.moveDown(1);

  if (visitor.photoData?.startsWith("data:image")) {
    const buffer = Buffer.from(visitor.photoData.split(",")[1], "base64");
    doc.image(buffer, { width: 180, align: "center" });
  }

  doc.end();
};

// ✅ Request Pass
app.post("/api/request-pass", async (req, res) => {
  const { name, email, phone, visitDate, host, hostEmail, purpose, photoData } = req.body;
  const passNumber = `TRF-${Math.floor(100000 + Math.random() * 900000)}`;

  try {
    const visitor = await Visitor.create({
      passNumber, name, email, phone, visitDate, host, hostEmail, purpose, photoData
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

    const chunks = [];
    const doc = new PDFDocument();
    doc.on("data", chunk => chunks.push(chunk));
    doc.on("end", async () => {
      const pdfBuffer = Buffer.concat(chunks);

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

    generateVisitorPassPDF(visitor, doc);

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

// ✅ Download Pass (Security Guard)
app.get("/api/download-pass/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const visitor = await Visitor.findById(id);
    if (!visitor || visitor.status !== "approved") {
      return res.status(404).send("Pass not found or not approved");
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename=${visitor.passNumber}.pdf`);
    generateVisitorPassPDF(visitor, res);

  } catch (err) {
    console.error("❌ Error generating download PDF:", err);
    res.status(500).send("Failed to generate PDF");
  }
});

// ✅ View Visitors
app.get("/api/visitors", async (req, res) => {
  try {
    const visitors = await Visitor.find().sort({ issuedAt: -1 });
    res.json(visitors);
  } catch (err) {
    console.error("❌ Fetch error:", err);
    res.status(500).send("Failed to retrieve visitors");
  }
});

// ✅ Cleanup Old Records
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
