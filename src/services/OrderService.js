const Order = require('../models/OrderModel');
const Story = require('../models/StoryRoutes');
const EmailService = require('./EmailService');
const Product = require('../models/ProductModel');

const createOrder = async (newOrder) => {
    try {
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
const cancelOrderDetail = (orderId, data) => {
    return new Promise(async (resolve, reject) => {
        try {
            const order = await Order.findById(orderId);
            if (!order) {
                resolve({
                    status: 'ERR',
                    message: 'The order is not defined',
                });
                return;
            }

            const promises = data.map(async (order) => {
                const productData = await Product.findOneAndUpdate(
                    {
                        _id: order.product,
                        countInStock: { $gte: 0 } // Ensure we don't go negative
                    },
                    {
                        $inc: {
                            countInStock: +order.amount,
                            sold: -order.amount,
                        },
                    },
                    { new: true },
                );
                if (!productData) {
                    return {
                        status: 'ERR',
                        message: 'ERR',
                        id: order.product,
                    };
                }
                return { status: 'OK' };
            });

            const results = await Promise.all(promises);
            const errorResult = results.find(res => res.status === 'ERR');

            if (errorResult) {
                // Optional: Rollback previous stock updates if one fails.
                // For now, we just report the error.
                return resolve({ status: 'ERR', message: `Product with id: ${errorResult.id} not found or stock issue.` });
            }

            const deletedOrder = await Order.findByIdAndDelete(orderId);

            resolve({
                status: 'OK',
                message: 'success',
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
