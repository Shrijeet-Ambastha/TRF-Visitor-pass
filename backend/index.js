// backend/index.js
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

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch(err => console.error("❌ MongoDB connection error:", err));

const visitorSchema = new mongoose.Schema({
  passNumber: String,
  name: String,
  email: String,
  phone: String,
  visitDate: String,
  visitTime: String,
  endTime: String,
  host: String,
  hostEmail: String,
  purpose: String,
  photoData: String,
  personType: String,
  visitArea: String,
  ppe: String,
  govtIdType: String,
  govtIdNumber: String,
  laptopNo: String,
  vehicleNo: String,
  status: { type: String, default: "pending" },
  issuedAt: { type: Date, default: Date.now }
});

const Visitor = mongoose.model("Visitor", visitorSchema);

app.use(bodyParser.json({ limit: "5mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "5mb" }));

app.use(express.static(path.join(__dirname, "..", "frontend")));

app.post("/api/request-pass", async (req, res) => {
  const data = req.body;
  const passNumber = `TRF-${Math.floor(100000 + Math.random() * 900000)}`;
  try {
    const visitor = await Visitor.create({ ...data, passNumber });
    const approvalLink = `${process.env.BASE_URL}/api/approve/${visitor._id}`;
    const rejectionLink = `${process.env.BASE_URL}/api/reject/${visitor._id}`;
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: visitor.hostEmail,
      subject: `Approval Needed - ${passNumber}`,
      html: `
        <p>Hello ${visitor.host},</p>
        <p>${visitor.name} has requested a visit on ${visitor.visitDate}.</p>
        <p><strong>Purpose:</strong> ${visitor.purpose}</p>
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

function createPdf(doc, visitor) {
  const bgPath = path.join(__dirname, "background.png");
  if (fs.existsSync(bgPath)) {
    doc.image(bgPath, 0, 0, { width: doc.page.width, height: doc.page.height });
  }

  const logoPath = path.join(__dirname, "trf.png");
  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, 450, 20, { width: 100 });
  }

  doc.fontSize(14).text("TRF Ltd", { align: "center" });
  doc.fontSize(20).text("Visitor E-Pass", { align: "center" });
  doc.moveDown();

  const details = [
    [`Pass No`, visitor.passNumber],
    [`Name`, visitor.name],
    [`Email`, visitor.email],
    [`Phone`, visitor.phone],
    [`Visit Date`, visitor.visitDate],
    [`Visit Time`, visitor.visitTime || "N/A"],
    [`End Time`, visitor.endTime || "N/A"],
    [`Host`, visitor.host],
    [`Person Type`, visitor.personType || "N/A"],
    [`Area of Visit`, visitor.visitArea || "N/A"],
    [`PPE`, visitor.ppe || "N/A"],
    [`Govt ID`, `${visitor.govtIdType || "N/A"} - ${visitor.govtIdNumber || ""}`],
    [`Laptop No`, visitor.laptopNo || "N/A"],
    [`Vehicle No`, visitor.vehicleNo || "N/A"],
    [`Purpose`, visitor.purpose]
  ];

  details.forEach(([label, value]) => {
    doc.fontSize(11).text(`${label}: ${value}`);
  });

  if (visitor.photoData?.startsWith("data:image")) {
    const buffer = Buffer.from(visitor.photoData.split(",")[1], "base64");
    doc.image(buffer, 400, 200, { width: 100 });
  }

  doc.moveDown();
  doc.fontSize(16).text("Instructions:", { underline: true });
  const instructions = [
    "-> You are not allowed to work inside plant with this Pass.",
    "-> Fold paper as marked in dotted line.",
    "-> Pass valid for specified date/time.",
    "-> Non-transferable and for declared purpose only.",
    "-> No persons under 18 years.",
    "-> No photography inside premises.",
    "-> You are responsible for your own safety and belongings.",
    "-> Host to provide PPE and safety briefing.",
    "-> Host must sign pass post-visit.",
    "-> Pass must be returned at gate.",
    "-> Material/documents must be declared for approval."
  ];
  instructions.forEach(text => doc.fontSize(14).text(`• ${text}`));

  doc.moveDown();
  doc.fontSize(10).text(`* This pass is valid for ${visitor.visitDate}`, { align: "left" });
  doc.moveDown();
  doc.text("Visitor Signature", { continued: true });
  doc.text("Host Signature", { align: "right" });

  doc.end();
}

app.get("/api/approve/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const visitor = await Visitor.findById(id);
    if (!visitor) return res.status(404).send("Visitor not found");
    if (visitor.status === "approved") return res.send("Already approved");

    visitor.status = "approved";
    await visitor.save();

    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const buffers = [];
    doc.on("data", buffers.push.bind(buffers));
    doc.on("end", async () => {
      const pdfBuffer = Buffer.concat(buffers);
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
      });

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: [visitor.email, visitor.hostEmail],
        subject: `TRF Visitor Pass - ${visitor.passNumber}`,
        text: `Your visit is approved. See attached pass.`,
        attachments: [{ filename: "visitor-pass.pdf", content: pdfBuffer }]
      };
      await transporter.sendMail(mailOptions);
      res.send("✅ Approved and emailed.");
    });

    createPdf(doc, visitor);
  } catch (err) {
    console.error("❌ Approval error:", err);
    res.status(500).send("Approval failed");
  }
});

app.get("/api/download-pass/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const visitor = await Visitor.findById(id);
    if (!visitor || visitor.status !== "approved") {
      return res.status(404).send("Not approved or missing");
    }

    const doc = new PDFDocument({ size: "A4", margin: 40 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename=${visitor.passNumber}.pdf`);
    doc.pipe(res);
    createPdf(doc, visitor);
  } catch (err) {
    console.error("❌ Download error:", err);
    res.status(500).send("Download failed");
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
