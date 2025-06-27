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

mongoose.connect("mongodb+srv://ambasthashrijeet:Shrijeet%40123@cluster0.h5l0rgj.mongodb.net/visitor-pass?retryWrites=true&w=majority&appName=Cluster0")
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));
const visitorSchema = new mongoose.Schema({
  passNumber: String,
  name: String,
  email: String,
  phone: String,
  visitDate: String,
  host: String,
  hostEmail: String,
  purpose: String,
  status: { type: String, default: "pending" },
  issuedAt: { type: Date, default: Date.now }
});

const Visitor = mongoose.model("Visitor", visitorSchema);

app.use(express.static(path.join(__dirname, "..", "frontend")));
app.use(bodyParser.json());
app.post("/api/request-pass", async (req, res) => {
  const { name, email, phone, visitDate, host, hostEmail, purpose } = req.body;
  const passNumber = `TRF-${Math.floor(100000 + Math.random() * 900000)}`;

  try {
    const visitor = await Visitor.create({
      passNumber, name, email, phone, visitDate, host, hostEmail, purpose, status: "pending"
    });

    const approvalLink = `http://localhost:3000/api/approve/${visitor._id}`;

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

    res.status(200).json({ message: "Request submitted. Awaiting host approval." });
  } catch (err) {
    console.error("❌ Failed to process request:", err);
    res.status(500).send("Error processing visitor request");
  }
});
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

      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: visitor.email,
        subject: "Your Visitor Pass",
        text: "Your visit is approved. PDF attached.",
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

    const logoPath = path.join(__dirname, "trf.PNG");
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, { fit: [100, 100], align: "center" });
    }

    doc.fontSize(20).text("Visitor E-Pass", { align: "center" });
    doc.moveDown();
    doc.fontSize(12).text(`Pass No: ${visitor.passNumber}`);
    doc.text(`Name: ${visitor.name}`);
    doc.text(`Email: ${visitor.email}`);
    doc.text(`Phone: ${visitor.phone}`);
    doc.text(`Visit Date: ${visitor.visitDate}`);
    doc.text(`Host: ${visitor.host}`);
    doc.text(`Purpose: ${visitor.purpose}`);
    doc.end();

  } catch (err) {
    console.error("❌ Error approving:", err);
    res.status(500).send("Error processing approval");
  }
});
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
