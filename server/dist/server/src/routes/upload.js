import { v4 as uuidv4 } from 'uuid';
// 临时存储上传的图片（生产环境应使用云存储）
const tempImages = new Map();
// 清理过期图片（1小时后过期）
const imageExpiry = new Map();
const EXPIRY_TIME = 60 * 60 * 1000; // 1小时
function cleanupExpiredImages() {
    const now = Date.now();
    for (const [id, expiry] of imageExpiry.entries()) {
        if (now > expiry) {
            tempImages.delete(id);
            imageExpiry.delete(id);
        }
    }
}
export default async function uploadRoutes(app) {
    // POST /api/upload - 上传图片
    app.post('/api/upload', async (req, res) => {
        try {
            const { dataUrl } = req.body;
            if (!dataUrl || !dataUrl.startsWith('data:image/')) {
                return res.status(400).send({ error: 'Invalid image data' });
            }
            // 生成唯一ID
            const imageId = uuidv4();
            // 存储图片数据
            tempImages.set(imageId, dataUrl);
            imageExpiry.set(imageId, Date.now() + EXPIRY_TIME);
            // 清理过期图片
            cleanupExpiredImages();
            // 返回可访问的URL
            const imageUrl = `http://localhost:3001/api/upload?id=${imageId}`;
            return res.send({ url: imageUrl });
        }
        catch (error) {
            console.error('Upload error:', error);
            return res.status(500).send({ error: 'Upload failed' });
        }
    });
    // GET /api/upload?id=xxx - 获取图片
    app.get('/api/upload', async (req, res) => {
        try {
            const { id } = req.query;
            if (!id || typeof id !== 'string') {
                return res.status(400).send({ error: 'Missing image ID' });
            }
            const dataUrl = tempImages.get(id);
            if (!dataUrl) {
                return res.status(404).send({ error: 'Image not found or expired' });
            }
            // 解析dataURL
            const [header, base64Data] = dataUrl.split(',');
            const mimeMatch = header.match(/data:([^;]+)/);
            const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
            // 转换为Buffer
            const buffer = Buffer.from(base64Data, 'base64');
            // 设置响应头
            res.header('Content-Type', mimeType);
            res.header('Content-Length', buffer.length.toString());
            res.header('Cache-Control', 'public, max-age=3600'); // 缓存1小时
            return res.send(buffer);
        }
        catch (error) {
            console.error('Get image error:', error);
            return res.status(500).send({ error: 'Failed to retrieve image' });
        }
    });
}
