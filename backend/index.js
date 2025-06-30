require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const PDFDocument = require("pdfkit");
const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const nodemailer = require("nodemailer");

const app = express();
app.use(express.static(path.join(__dirname, "public")));
const PORT = 3000;

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// Mongoose Schema
const visitorSchema = new mongoose.Schema({
  passNumber: String,
  name: String,
  email: String,
  phone: String,
  visitDate: String,
  host: String,
  hostEmail: String,
  purpose: String,
  photoData: String, // base64 photo
  status: { type: String, default: "pending" },
  issuedAt: { type: Date, default: Date.now }
});

const Visitor = mongoose.model("Visitor", visitorSchema);

app.use(bodyParser.json());

// ✅ Handle Visitor Request
app.post("/api/request-pass", async (req, res) => {
  const { name, email, phone, visitDate, host, hostEmail, purpose, photoData } = req.body;
  const passNumber = `TRF-${Math.floor(100000 + Math.random() * 900000)}`;

  try {
    const visitor = await Visitor.create({
      passNumber, name, email, phone, visitDate, host, hostEmail, purpose, photoData
    });

    const approvalLink = `https://trf-visitor-pass.onrender.com/api/approve/${visitor._id}`;

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
      text: `Hello ${host},\n\n${name} has requested a visit on ${visitDate}.\n\nPurpose: ${purpose}\n\nClick below to approve:\n${approvalLink}`
    });

    res.status(200).json({ message: "✅ Request submitted. Awaiting host approval." });
  } catch (err) {
    console.error("❌ Failed to process request:", err);
    res.status(500).send("Error processing visitor request");
  }
});

// ✅ Host Approval Route
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

    doc.on("data", (chunk) => chunks.push(chunk));
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

      // Send to visitor
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: visitor.email,
        subject: "Your Visitor Pass",
        text: "Your visit is approved. PDF attached.",
        attachments: [attachment]
      });

      // Send to host
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: visitor.hostEmail,
        subject: `Visitor Pass for ${visitor.name}`,
        text: `${visitor.name} has been approved. PDF attached.`,
        attachments: [attachment]
      });

      res.send("✅ Approved. PDF sent to visitor and host.");
    });

    // ✅ Add Logo
    const logoPath = path.join(__dirname, "trf.PNG");
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
    doc.text(`Host: ${visitor.host}`);
    doc.text(`Purpose: ${visitor.purpose}`);
    doc.moveDown(1);

    // ✅ Embed the captured image
    if (visitor.photoData && visitor.photoData.startsWith("data:image")) {
      const base64Data = visitor.photoData.replace(/^data:image\/png;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");
      doc.image(buffer, { width: 180, align: "center" });
    }

    doc.end();

  } catch (err) {
    console.error("❌ Error approving visitor:", err);
    res.status(500).send("Error during approval");
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
