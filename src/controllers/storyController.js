const Story = require('../models/StoryRoutes');
const { GoogleGenerativeAI } = require('@google/generative-ai');
// In Node.js environments before v18, the `fetch` API is not available globally.
// The @google/generative-ai SDK uses `fetch` and its related classes like `Headers`.
// We need to polyfill them using `node-fetch`.
if (typeof fetch === 'undefined' && typeof global.fetch === 'undefined') {
    const fetch = require('node-fetch');
    global.fetch = fetch;
    global.Headers = fetch.Headers;
}
require('dotenv').config();

// Lấy API key từ biến môi trường để bảo mật
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
});

const generationConfig = {
    temperature: 1,
    topP: 0.95,
    topK: 40,
    maxOutputTokens: 4096,
    responseMimeType: 'text/plain',
};
const createStory = async (req, res) => {
    const {
        name,
        content,
        age,
        image,
        price,
        discount,
        author,
        description,
        sold,
        rating,
        pricesale,
        type,
        countInStock,
    } = req.body;

    const requiredFields = [
        { field: 'name', value: name },
        { field: 'content', value: content },
        { field: 'age', value: age },
        // { field: 'image', value: image },
        { field: 'price', value: price },
        { field: 'author', value: author },
        { field: 'discount', value: discount },
        // { field: 'description', value: description },
        { field: 'sold', value: sold },
        { field: 'rating', value: rating },
        { field: 'pricesale', value: pricesale },
        { field: 'type', value: type },
        { field: 'countInStock', value: countInStock },
    ];

    // Check for missing required fields and build a message
    const missingFields = requiredFields.filter((item) => !item.value).map((item) => item.field);

    if (missingFields.length > 0) {
        return res.status(400).json({
            error: `Thiếu thông tin đầu vào: ${missingFields.join(', ')}`,
        });
    }

    let ageValue = age;
    if (age.includes('-')) {
        const [minAge, maxAge] = age.split('-').map(Number);
        if (isNaN(minAge) || isNaN(maxAge)) {
            return res.status(400).json({ error: 'Độ tuổi không hợp lệ!' });
        }
        ageValue = Math.round((minAge + maxAge) / 2);
    }

    const userInputText = `
        Tạo câu chuyện từ ${ageValue} tuổi, câu chuyện ${name},
        Nội dung câu chuyện về ${content} với ${type}. Hãy cung cấp 5 chương, mỗi chương khoảng 30 từ . Tất cả yêu cầu cần ở định dạng JSON.
    `;
    //kèm theo mô tả chi tiết cho hình ảnh tương ứng với từng chương, và lời nhắc tạo hình ảnh cho bìa sách với tên câu chuyện.
    try {
        // Start a chat session with the AI model
        const chatSession = await model.startChat({
            generationConfig,
            history: [
                {
                    role: 'user',
                    parts: [{ text: userInputText }],
                },
            ],
        });

        // Send the user input and get a response
        const result = await chatSession.sendMessage(userInputText);
        let responseText = result.response.text(); // Get the AI-generated response as text

        // Process the AI response (ensure it's valid JSON)
        let storyData = {};
        try {
            // Clean up the response text and remove code block markers
            responseText = responseText.replace(/```json|\n|```/g, '').trim();
            storyData = JSON.parse(responseText); // Parse the cleaned response into JSON
        } catch (err) {
            return res.status(500).json({ error: 'Lỗi trong quá trình phân tích kết quả AI!' }); // JSON parse error
        }

        // Prepare new story data using AI response or fallback to input data
        const newStoryData = {
            name: storyData.name || name,
            content,
            genre: storyData.genre || 'Chưa xác định', // Default value for genre if not provided by AI
            age: ageValue,
            price,
            discount,
            description: storyData.cover_image?.description || responseText,
            author,
            image: storyData.cover_image?.url || image, // Use AI-generated image URL or fallback to input image
            sold,
            rating,
            type,
            pricesale,
            countInStock,
        };

        // Create a new Story document
        const newStory = new Story(newStoryData);
        await newStory.save(); // Save the story to the database

        // Return success response
        res.status(201).json({
            message: 'Câu chuyện được tạo thành công!',
            status: 'OK',
            story: newStory,
        });
    } catch (error) {
        // Log the error for debugging
        console.error('Error creating story:', error);
        res.status(500).json({ error: 'Lỗi khi tạo câu chuyện!', status: 'ERR' }); // Generic error response
    }
};

const removeVietnameseTones = (str) => {
    return str
        .normalize('NFD') // Chuyển đổi thành dạng decomposed, các ký tự dấu sẽ tách khỏi ký tự gốc
        .replace(/[\u0300-\u036f]/g, '') // Loại bỏ các dấu thanh (accents)
        .replace(/đ/g, 'd') // Chuyển "đ" thành "d"
        .replace(/Đ/g, 'D') // Chuyển "Đ" thành "D"
        .replace(/[^a-zA-Z0-9\s]/g, '') // Loại bỏ các ký tự không phải chữ cái hoặc số
        .toLowerCase(); // Chuyển tất cả về chữ thường
};

const getAllStories = async (req, res) => {
    try {
        // Lấy các tham số từ query
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 10, 10);
        const skip = parseInt(req.query.skip) || (page - 1) * limit;

        const searchQuery = req.query.search || '';
        const filters = {};

        if (searchQuery) {
            filters.$or = [
                { name: { $regex: searchQuery, $options: 'i' } },
                { author: { $regex: searchQuery, $options: 'i' } },
                { type: { $regex: searchQuery, $options: 'i' } },
            ];
        }

        const [stories, totalStories] = await Promise.all([
            Story.find(filters).skip(skip).limit(limit),
            Story.countDocuments(filters),
        ]);

        if (stories.length === 0) {
            return res.status(200).json({
                message: 'Không tìm thấy truyện nào phù hợp với tìm kiếm!',
            });
        }

        res.status(200).json({
            message: 'Danh sách câu chuyện',
            stories,
            pagination: {
                page,
                limit,
                skip,
                totalStories,
                totalPages: Math.ceil(totalStories / limit),
            },
        });
    } catch (error) {
        console.error(error); // Log lỗi ra console để debug
        res.status(500).json({ error: 'Lỗi khi lấy danh sách câu chuyện!', details: error.message });
    }
};

const getStoryById = async (req, res) => {
    const { id } = req.params; // Lấy ID từ URL

    try {
        const story = await Story.findById(id); // Tìm câu chuyện theo ID
        if (!story) {
            return res.status(404).json({ error: 'Câu chuyện không tồn tại!' });
        }
        res.status(200).json({
            message: 'Thông tin câu chuyện',
            story,
        });
    } catch (error) {
        res.status(500).json({ error: 'Lỗi khi lấy câu chuyện!' });
    }
};

const deleteStory = async (req, res) => {
    const { id } = req.params; // Lấy ID từ URL

    try {
        const deletedStory = await Story.findByIdAndDelete(id); // Xóa câu chuyện theo ID
        if (!deletedStory) {
            return res.status(404).json({ error: 'Câu chuyện không tồn tại!' });
        }
        res.status(200).json({
            message: 'Câu chuyện đã được xóa thành công!',
        });
    } catch (error) {
        res.status(500).json({ error: 'Lỗi khi xóa câu chuyện!' });
    }
};

const updateStory = async (req, res) => {
    const { name, content, age, image, price, discount, author, sold, rating, pricesale, type, countInStock } =
        req.body;

    try {
        const story = await Story.findById(req.params.id);
        if (!story) {
            return res.status(404).json({ error: 'Câu chuyện không tồn tại.' });
        }

        // ✅ Xử lý độ tuổi
        let ageValue = age;
        if (typeof age === 'string' && age.includes('-')) {
            const [minAge, maxAge] = age.split('-').map(Number);
            if (isNaN(minAge) || isNaN(maxAge)) {
                return res.status(400).json({ error: 'Độ tuổi không hợp lệ!' });
            }
            ageValue = Math.round((minAge + maxAge) / 2);
        }

        // ✅ Prompt yêu cầu AI trả về JSON có cấu trúc
        const userInputText = `
            Tạo câu chuyện từ ${ageValue} tuổi, câu chuyện ${name},
            Nội dung câu chuyện về ${content} với ${type}. Hãy cung cấp 40 chương, mỗi chương khoảng 100 từ . Tất cả yêu cầu cần ở định dạng JSON.
        `;

        // ✅ Gọi model AI
        const chatSession = await model.startChat({
            generationConfig,
            history: [
                {
                    role: 'user',
                    parts: [{ text: userInputText }],
                },
            ],
        });

        const result = await chatSession.sendMessage(userInputText);
        console.log(result.response.text(), 'log');
        let responseText = result.response.text();

        // ✅ Làm sạch output AI
        responseText = responseText.replace(/```json|```/g, '').trim();

        let parsedDescription;
        try {
            parsedDescription = JSON.parse(responseText); // parse JSON
        } catch (err) {
            console.warn('⚠️ AI không trả về JSON hợp lệ, dùng chuỗi text thuần.');
            parsedDescription = { summary: responseText }; // fallback
        }

        // ✅ Xử lý cập nhật countInStock
        if (countInStock !== undefined) {
            const amountToChange = Number(countInStock);
            if (isNaN(amountToChange)) {
                return res.status(400).json({ error: 'Số lượng tồn kho không hợp lệ.' });
            }

            const newStock = story.countInStock + amountToChange;

            if (newStock < 0) {
                return res
                    .status(400)
                    .json({ error: `Không thể xuất kho. Số lượng tồn kho không đủ (hiện có: ${story.countInStock}).` });
            }

            story.countInStock = newStock;
        }

        // ✅ Cập nhật câu chuyện
        story.age = ageValue;
        story.type = type;
        story.name = name;
        story.content = content;
        story.description = JSON.stringify(parsedDescription); // JSON object
        story.image = image;
        story.price = price;
        story.discount = discount;
        story.author = author;
        story.sold = sold;
        story.rating = rating;
        story.pricesale = pricesale;

        await story.save();

        res.status(200).json({
            message: 'Cập nhật câu chuyện thành công!',
            story,
            status: 'OK',
        });
    } catch (error) {
        console.error('❌ Error updating story:', error);
        res.status(500).json({ error: 'Lỗi khi cập nhật câu chuyện!', status: 'ERR' });
    }
};

const hotNews = async (req, res) => {
    try {
        // Lấy 5 câu chuyện mới nhất, sắp xếp theo createdAt giảm dần
        const latestStories = await Story.find().sort({ createdAt: -1 }).limit(5);

        // Kiểm tra nếu không có câu chuyện nào
        if (latestStories.length === 0) {
            return res.status(200).json({
                message: 'Không có câu chuyện nào!',
            });
        }

        // Trả về danh sách các câu chuyện mới nhất
        res.status(200).json({
            message: 'Danh sách 5 câu chuyện mới nhất',
            stories: latestStories,
        });
    } catch (error) {
        console.error('Error fetching latest stories:', error);
        res.status(500).json({ error: 'Lỗi khi lấy danh sách câu chuyện mới nhất!' });
    }
};

const updateMultipleStories = async (req, res) => {
    const { stories } = req.body; // Mong đợi một mảng dạng [{ id, countInStock }]

    if (!Array.isArray(stories) || stories.length === 0) {
        return res.status(400).json({ error: 'Request body phải là một mảng các story cần cập nhật.' });
    }

    const results = [];

    for (const storyUpdate of stories) {
        const { id, countInStock } = storyUpdate;

        if (!id || countInStock === undefined) {
            results.push({ id, status: 'ERR', message: 'Mỗi story phải có id và countInStock.' });
            continue; // Bỏ qua và xử lý item tiếp theo
        }

        const amountToChange = Number(countInStock);
        if (isNaN(amountToChange)) {
            results.push({ id, status: 'ERR', message: 'countInStock phải là một số.' });
            continue;
        }

        try {
            const story = await Story.findById(id);
            if (!story) {
                results.push({ id, status: 'ERR', message: 'Câu chuyện không tồn tại.' });
                continue;
            }

            const newStock = story.countInStock + amountToChange;

            if (newStock < 0) {
                results.push({
                    id,
                    status: 'ERR',
                    message: `Không thể xuất kho. Số lượng tồn kho không đủ (hiện có: ${story.countInStock}).`,
                });
                continue;
            }

            story.countInStock = newStock;
            await story.save();
            results.push({ id, status: 'OK', message: 'Cập nhật thành công.' });
        } catch (error) {
            results.push({ id, status: 'ERR', message: `Lỗi hệ thống: ${error.message}` });
        }
    }

    res.status(200).json({ message: 'Hoàn tất cập nhật hàng loạt.', results });
};

module.exports = { createStory, getAllStories, getStoryById, deleteStory, updateStory, hotNews, updateMultipleStories };
