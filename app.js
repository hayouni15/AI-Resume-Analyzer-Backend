const express = require("express");
const multer = require("multer");
const cors = require("cors");
const pdfParse = require("pdf-parse"); // Import pdf-parse
const aiInference = require("@azure-rest/ai-inference");
const { AzureKeyCredential } = require("@azure/core-auth");

const ModelClient = aiInference.default;
const { isUnexpected } = aiInference;

const app = express();
require("dotenv").config();
app.use(express.json({ limit: "10mb" })); // or even higher like '20mb' if needed
const port = process.env.PORT || 3000;
app.use(cors());

// Setup CORS if needed
app.use(cors());

// Multer setup
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// openai
const token = process.env.GITHUB_ACCESS_TOKEN;
const endpoint = "https://models.github.ai/inference";
const model = "openai/gpt-4.1";

// Route
app.post(
  "/resumes/analyze2",
  upload.fields([
    { name: "resume", maxCount: 1 },
    { name: "jobDesc", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      console.log("Request Headers:", req.headers);
      console.log("Request Body:", req.body);

      const files = req.files;
      console.log("Request Files:", files);

      const resumeFile = files["resume"]?.[0];
      const jobDescFile = files["jobDesc"]?.[0];

      if (!resumeFile || !jobDescFile) {
        return res.status(400).json({ error: "Both files are required." });
      }

      // Convert resume PDF buffer to text
      const resumeText = await pdfParse(resumeFile.buffer).then(
        (data) => data.text
      );
      const jobDescText = await pdfParse(jobDescFile.buffer).then(
        (data) => data.text
      );

      console.log("Resume Text:", resumeText);
      console.log("Job Description Text:", jobDescText);
      const client = ModelClient(endpoint, new AzureKeyCredential(token));

      const prompt = `Given the following resume and job description, provide:\n1. A professional summary of the candidate\n2. Key strengths\n3. Notable weaknesses\n4. Any red flags\n5. A fit score (0 to 100) based on alignment with the job description\n\nResume:\n${resumeText}\n\nJob Description:\n${jobDescText}. The response should be in json format {summary:"summary",strength:"strengths",fitScore:"fit score"}`;

      const response = await client.path("/chat/completions").post({
        body: {
          messages: [
            {
              role: "system",
              content:
                "You are a recruiter assistant that analyzes resumes based on job descriptions.",
            },
            { role: "user", content: prompt },
          ],
          temperature: 1,
          top_p: 1,
          model: model,
        },
      });

      if (isUnexpected(response)) {
        throw response.body.error;
      }

      const analysis = response.body.choices[0].message.content;
      console.log(analysis);
      res.json(JSON.parse(analysis));
    } catch (error) {
      console.error("Error in /resumes/analyze2:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Start server
app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
