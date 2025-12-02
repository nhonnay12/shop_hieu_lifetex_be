const Order = require('../models/OrderModel');
const EmailService = require('./EmailService');
const Story = require('../models/StoryRoutes'); // Thay Product bằng Story

const createOrder = async (newOrder) => {
    try {
        // Lặp qua từng sản phẩm trong đơn hàng để cập nhật số lượng
        for (const item of newOrder.orderItems) {
            const product = await Story.findById(item.story); // 'story' được dùng như product id
            if (!product) {
                return {
                    status: 'ERR',
                    message: `Sản phẩm với ID ${item.story} không tồn tại.`,
                };
            }
            if (product.countInStock < item.amount) {
                return {
                    status: 'ERR',
                    message: `Sản phẩm ${product.name} không đủ hàng.`,
                };
            }
            // Cập nhật countInStock và sold
            product.countInStock -= item.amount;
            product.sold = (product.sold || 0) + item.amount;
            await product.save();
        }

        // Tạo đối tượng đơn hàng mới từ dữ liệu đầu vào
        const isPaid = newOrder.paymentMethod === 'paypal';
        const order = new Order({
            orderItems: newOrder.orderItems || [],
            shippingAddress: {
                fullName: newOrder.fullName,
                address: newOrder.address,
                city: newOrder.city,
                phone: newOrder.phone,
                email: newOrder.email || '',
            },
            paymentMethod: newOrder.paymentMethod, // Phương thức thanh toán
            deliveryMethod: newOrder.deliveryMethod, // Phương thức giao hàng
            itemsPrice: newOrder.itemsPrice, // Tổng giá trị sản phẩm
            shippingPrice: newOrder.shippingPrice, // Phí vận chuyển
            totalPrice: newOrder.totalPrice, // Tổng giá trị đơn hàng
            user: newOrder.user, // ID người dùng
            isPaid,
            paidAt: isPaid ? new Date() : null,
        });

        // Lưu đơn hàng vào cơ sở dữ liệu
        const savedOrder = await order.save();

        // Trả về phản hồi thành công
        return {
            status: 'OK',
            message: 'Order created successfully',
            data: savedOrder,
        };
    } catch (error) {
        // Bắt lỗi trong quá trình xử lý
        console.error('Error creating order:', error);
        return {
            status: 'ERR',
            message: 'Failed to create order',
            error: error.message,
        };
    }
};
const getAllOrderDetail = (id) => {
    return new Promise(async (resolve, reject) => {
        try {
            const order = await Order.find({
                user: id,
            });
            if (order === null) {
                resolve({
                    status: 'ERR',
                    message: 'The order is not defined',
                });
            }
            resolve({
                status: 'OK',
                message: 'SUCCESS',
                data: order,
            });
        } catch (e) {
            reject(e);
        }
    });
};

const getOrderDetail = (id) => {
    return new Promise(async (resolve, reject) => {
        try {
            const order = await Order.findById({
                _id: id,
            });
            if (order === null) {
                resolve({
                    status: 'ERR',
                    message: 'The order is not defined',
                });
            }
            resolve({
                status: 'OK',
                message: 'SUCCESS',
                data: order,
            });
        } catch (e) {
            reject(e);
        }
    });
};
const cancelOrderDetail = (orderId) => {
    return new Promise(async (resolve, reject) => {
        try {
            const order = await Order.findById(orderId);
            if (!order) {
                return resolve({
                    status: 'ERR',
                    message: 'The order is not defined',
                });
            }

            // Restore stock for each item in the order
            const promises = order.orderItems.map(async (item) => {
                const productData = await Story.findOneAndUpdate(
                    {
                        _id: item.story, // Use 'story' which acts as product id
                    },
                    {
                        $inc: {
                            countInStock: +item.amount,
                            sold: -item.amount,
                        },
                    },
                    { new: true },
                );

                if (!productData) {
                    // Throw an error to stop Promise.all
                    throw new Error(`Product with id: ${item.story} not found or stock issue.`);
                }
            });

            await Promise.all(promises);

            const deletedOrder = await Order.findByIdAndDelete(orderId);
            if (!deletedOrder) {
                return resolve({
                    status: 'ERR',
                    message: 'Failed to delete the order after restoring stock.',
                });
            }

            resolve({
                status: 'OK',
                message: 'Order canceled and stock restored successfully',
                data: deletedOrder,
            });
        } catch (e) {
            reject(e);
        }
    });
};
const getAllOrder = () => {
    return new Promise(async (resolve, reject) => {
        try {
            const allOrder = await Order.find().sort({ createdAt: -1, updatedAt: -1 });
            resolve({
                status: 'OK',
                message: 'Success',
                data: allOrder,
            });
        } catch (e) {
            reject(e);
        }
    });
};
const deleteOrder = (id) => {
    return new Promise(async (resolve, reject) => {
        try {
            const checkOrder = await Order.findOne({
                _id: id,
            });
            if (checkOrder === null) {
                resolve({
                    status: 'ERR',
                    message: 'The user is not defined',
                });
            }

            await Order.findByIdAndDelete(id);
            resolve({
                status: 'OK',
                message: 'Delete user success',
            });
        } catch (e) {
            reject(e);
        }
    });
};
module.exports = {
    createOrder,
    getAllOrderDetail,
    getOrderDetail,
    cancelOrderDetail,
    getAllOrder,
    deleteOrder,
};
