import { Router, Response, Request } from "express";
import ffmpeg from 'fluent-ffmpeg';
import { spawn } from 'child_process';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = Router();

// Setup upload directory
const uploadDir = path.resolve(__dirname, '..', '..', 'uploads');

if (!fs.existsSync(uploadDir)) {
	fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer configuration
const storage = multer.diskStorage({
	destination: (req, file, cb) => {
		cb(null, uploadDir);
	},
	filename: (req, file, cb) => {
		cb(null, file.originalname);
	}
});

const upload = multer({ storage: storage });

interface UploadProgress {
	totalChunks: number;
	receivedChunks: number;
	fileName: string;
	folderPath: string;
	batchName: string;
}

const uploadsMap: Record<string, UploadProgress> = {};

router.post(
	'/videos',
	upload.single('chunk'),
	async (req: Request, res: Response): Promise<void> => {
		const { fileId, chunkIndex, totalChunks, fileName, fileSize, batchName } = req.body;
		const chunkFile = req.file;

		if (!fileId || !chunkIndex || !fileName || !chunkFile || batchName === '') {
			return res.status(400).send(`request body:${req.body}`) as unknown as void;
		}

		const folderPath = path.join(__dirname, '..', '..', 'uploads', 'temp', fileId);
		if (!fs.existsSync(folderPath)) {
			fs.mkdirSync(folderPath, { recursive: true });
		}
		const chunkPath = path.join(folderPath, `chunk_${chunkIndex}`);
		fs.renameSync(chunkFile.path, chunkPath);

		if (!uploadsMap[fileId]) {
			uploadsMap[fileId] = {
				totalChunks: parseInt(totalChunks),
				receivedChunks: 0,
				fileName,
				folderPath,
				batchName
			}
		}

		uploadsMap[fileId].receivedChunks++;

		if (uploadsMap[fileId].receivedChunks === uploadsMap[fileId].totalChunks) {
			const tempPath = path.join(__dirname, '..', '..', 'uploads', `temp_${fileName}`)
			const finalPath = path.join(__dirname, '..', '..', 'uploads', fileName);
			const writeStream = fs.createWriteStream(tempPath);

			for (let i = 0; i < uploadsMap[fileId].totalChunks; i++) {
				const chunkPath = path.join(folderPath, `chunk_${i}`);
				const data = fs.readFileSync(chunkPath);
				writeStream.write(data);
			}
			writeStream.end();
			fs.rmSync(folderPath, { recursive: true, force: true });

			const resizeVideo = async (tempVidPath: string, finalVidPath: string): Promise<void> => {
				await new Promise<void>((resolve, reject) => {
					ffmpeg(tempVidPath)
						.outputOptions('-vf', 'scale=-2:720') // Resize to 720px height, maintain aspect ratio
						.save(finalVidPath) // Output video at the same path as input
						.on('end', () => {
							console.log('Video resized successfully');
							resolve();
						})
						.on('error', (err) => {
							console.error('Error resizing video', err);
							reject(err);
						});
				});
			};

			await resizeVideo(tempPath, finalPath);
			fs.rmSync(tempPath);


			const scriptPath = 'src/scripts/vid_prep.py';
			const args = ['-dir', `${batchName}`];
			const pythonProcess = spawn('python', [scriptPath, ...args]);

			let output = '';
			let errorOutput = '';

			pythonProcess.stdout.on('data', (data) => {
				output += data.toString();
			});

			pythonProcess.stderr.on('data', (data) => {
				errorOutput += data.toString();
			});

			delete uploadsMap[fileId];

			pythonProcess.on('close', (code) => {
				if (code === 0) {
					res.json({
						message: `${output.trim()}`,
					});
				} else {
					res.status(500).json({
						message: 'leaving blank for now!',
						error: errorOutput.trim(),
					});
				}
			});
		} else {
			res.json({
				message: `Chunk ${chunkIndex} received`,
			});
		}
	}
);

router.post(
	'/images',
	upload.single('chunk'),
	async (req: Request, res: Response): Promise<void> => {
		const { fileId, chunkIndex, totalChunks, fileName, fileSize, batchName } = req.body;
		const chunkFile = req.file;

		if (!fileId || !chunkIndex || !fileName || !chunkFile || batchName === '') {
			return res.status(400).send(`request body:${req.body}`) as unknown as void;
		}

		const folderPath = path.join(__dirname, '..', '..', 'uploads', 'temp', fileId);
		if (!fs.existsSync(folderPath)) {
			fs.mkdirSync(folderPath, { recursive: true });
		}
		const chunkPath = path.join(folderPath, `chunk_${chunkIndex}`);
		fs.renameSync(chunkFile.path, chunkPath);

		if (!uploadsMap[fileId]) {
			uploadsMap[fileId] = {
				totalChunks: parseInt(totalChunks),
				receivedChunks: 0,
				fileName,
				folderPath,
				batchName
			}
		}

		uploadsMap[fileId].receivedChunks++;

		if (uploadsMap[fileId].receivedChunks === uploadsMap[fileId].totalChunks) {
			const finalPath = path.join(__dirname, '..', '..', 'uploads', fileName);
			const writeStream = fs.createWriteStream(finalPath);

			for (let i = 0; i < uploadsMap[fileId].totalChunks; i++) {
				const chunkPath = path.join(folderPath, `chunk_${i}`);
				const data = fs.readFileSync(chunkPath);
				writeStream.write(data);
			}
			writeStream.end();
			fs.rmSync(folderPath, { recursive: true, force: true });


			const scriptPath = 'src/scripts/img_prep.py';
			const args = ['-dir', `${batchName}`];
			const pythonProcess = spawn('python', [scriptPath, ...args]);

			let output = '';
			let errorOutput = '';

			pythonProcess.stdout.on('data', (data) => {
				output += data.toString();
			});

			pythonProcess.stderr.on('data', (data) => {
				errorOutput += data.toString();
			});

			delete uploadsMap[fileId];

			pythonProcess.on('close', (code) => {
				if (code === 0) {
					res.json({
						message: `${output.trim()}`,
					});
				} else {
					res.status(500).json({
						message: 'leaving blank for now!',
						error: errorOutput.trim(),
					});
				}
			});
		} else {
			res.json({
				message: `Chunk ${chunkIndex} received`,
			});
		}
	}
);

export default router;
