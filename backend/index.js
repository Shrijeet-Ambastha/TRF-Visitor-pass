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

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// Visitor Schema
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
app.use(express.static(path.join(__dirname, "..", "frontend")));

// 🚀 Visitor Request API
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
      subject: "Approval Needed for Visitor",
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

// ✅ Approve API
app.get("/api/approve/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const visitor = await Visitor.findById(id);
    if (!visitor) return res.status(404).send("Visitor request not found");
    if (visitor.status === "approved") return res.send("Already approved");

    visitor.status = "approved";
    await visitor.save();

    const doc = new PDFDocument();
    const chunks = [];

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

    // Add background image
    const backgroundPath = path.join(__dirname, "background.png");
    if (fs.existsSync(backgroundPath)) {
      try {
        doc.image(backgroundPath, 0, 0, {
          width: doc.page.width,
          height: doc.page.height
        });
      } catch (err) {
        console.error("❌ Failed to add background image:", err.message);
      }
    }

    // Logo
    const logoPath = path.join(__dirname, "trf.png");
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, { fit: [130, 130], align: "center" });
      doc.moveDown(0.5);
    }

    // Header and Details
    doc.fontSize(20).fillColor("#004080").text("TRF Ltd", { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(26).fillColor("black").text("Visitor E-Pass", { align: "center" });
    doc.moveDown(1);
    doc.fontSize(16);
    doc.text(`Pass No: ${visitor.passNumber}`);
    doc.text(`Name: ${visitor.name}`);
    doc.text(`Email: ${visitor.email}`);
    doc.text(`Phone: ${visitor.phone}`);
    doc.text(`Visit Date: ${visitor.visitDate}`);
    doc.text(`Host: ${visitor.host}`);
    doc.text(`Purpose: ${visitor.purpose}`);
    doc.moveDown(1);

    // Photo
    if (visitor.photoData?.startsWith("data:image")) {
      const base64 = visitor.photoData.replace(/^data:image\/png;base64,/, "");
      const buffer = Buffer.from(base64, "base64");
      doc.image(buffer, { width: 180, align: "center" });
    }

    doc.end();
  } catch (err) {
    console.error("❌ Error approving visitor:", err);
    res.status(500).send("Error during approval");
  }
});

// ❌ Reject API
app.get("/api/reject/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const visitor = await Visitor.findById(id);
    if (!visitor) return res.status(404).send("Visitor request not found");
    if (visitor.status === "rejected") return res.send("Already rejected");
    if (visitor.status === "approved") return res.send("Already approved");

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
    console.error("❌ Error rejecting visitor:", err);
    res.status(500).send("Error during rejection");
  }
});

// ✅ Visitor History
app.get("/api/visitors", async (req, res) => {
  try {
    const visitors = await Visitor.find().sort({ issuedAt: -1 });
    res.json(visitors);
  } catch (err) {
    console.error("❌ Error fetching visitors:", err);
    res.status(500).send("Failed to retrieve visitors");
  }
});

// ✅ Cleanup Visitors Older Than 45 Days
app.delete("/api/cleanup-old-visitors", async (req, res) => {
  const days = 45;
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  try {
    const result = await Visitor.deleteMany({ issuedAt: { $lt: cutoffDate } });
    res.send(`🧹 Deleted ${result.deletedCount} visitor(s) older than ${days} days.`);
  } catch (err) {
    console.error("❌ Cleanup error:", err);
    res.status(500).send("Failed to clean up old visitor records.");
  }
});

// ✅ Serve index.html for frontend
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "frontend", "index.html"));
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
