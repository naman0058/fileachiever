USE bosvesedst_footwear_shop;

-- Default admin: admin@footwear.com / Admin@123
INSERT INTO admins (name, email, password) VALUES
('Super Admin', 'admin@footwear.com', '$2b$12$ZnM.re0VGqeoOl1txnm97.lXcIYNDmsXOZV2XNfyeo9.4mpyq7iEG');

-- Demo user: demo@example.com / User@123
INSERT INTO users (full_name, email, mobile, password, address, status) VALUES
('Demo Customer', 'demo@example.com', '9876543210', '$2b$12$uG5BIvu6VRp75mVca56MBO1lxD2w9uXzzfngo4KXMzo/Vv6vEjiXC', '12 MG Road, Mumbai', 'active');

INSERT INTO categories (name, slug) VALUES
('Men', 'men'),
('Women', 'women'),
('Kids', 'kids'),
('Sports Shoes', 'sports-shoes'),
('Casual Shoes', 'casual-shoes'),
('Formal Shoes', 'formal-shoes'),
('Sandals', 'sandals'),
('Slippers', 'slippers'),
('Boots', 'boots');

INSERT INTO brands (name, slug) VALUES
('Nike', 'nike'),
('Adidas', 'adidas'),
('Puma', 'puma'),
('Reebok', 'reebok'),
('Woodland', 'woodland'),
('Bata', 'bata'),
('Clarks', 'clarks'),
('Skechers', 'skechers');

INSERT INTO products (category_id, brand_id, name, slug, product_code, description, material, color, sizes, price, discount_price, discount_percent, stock_quantity, stock_status, status, main_image) VALUES
(1, 1, 'Nike Air Runner Pro', 'nike-air-runner-pro', 'NK-AR-001', 'Lightweight running shoes with breathable mesh upper and cushioned sole.', 'Mesh & Rubber', 'Black / White', '7,8,9,10,11', 8999.00, 7499.00, NULL, 45, 'in_stock', 'active', 'uploads/products/placeholder-1.svg'),
(2, 2, 'Adidas Classic Sneaker', 'adidas-classic-sneaker', 'AD-CS-002', 'Everyday casual sneaker with classic 3-stripe design.', 'Leather & Synthetic', 'White', '6,7,8,9', 5499.00, NULL, 10, 30, 'in_stock', 'active', 'uploads/products/placeholder-2.svg'),
(3, 3, 'Puma Kids Flex', 'puma-kids-flex', 'PM-KF-003', 'Flexible sole kids trainer for school and play.', 'Textile', 'Blue', '1,2,3,4,5', 2499.00, 1999.00, NULL, 60, 'in_stock', 'active', 'uploads/products/placeholder-3.svg'),
(4, 4, 'Reebok Sprint Trainer', 'reebok-sprint-trainer', 'RB-SP-004', 'High-grip sports shoe for gym and outdoor training.', 'Synthetic', 'Red / Black', '8,9,10,11,12', 4299.00, NULL, 15, 8, 'low_stock', 'active', 'uploads/products/placeholder-4.svg'),
(5, 5, 'Woodland Hiking Boot', 'woodland-hiking-boot', 'WD-HB-005', 'Rugged boot with water-resistant finish.', 'Leather', 'Brown', '7,8,9,10', 6999.00, 6299.00, NULL, 22, 'in_stock', 'active', 'uploads/products/placeholder-5.svg'),
(6, 6, 'Bata Formal Oxford', 'bata-formal-oxford', 'BT-FO-006', 'Polished formal shoe for office wear.', 'Genuine Leather', 'Black', '7,8,9,10,11', 3299.00, NULL, NULL, 15, 'in_stock', 'active', 'uploads/products/placeholder-6.svg'),
(7, 7, 'Clarks Comfort Sandal', 'clarks-comfort-sandal', 'CK-CS-007', 'Open toe sandal with cushioned footbed.', 'Leather', 'Tan', '6,7,8,9', 4599.00, 3999.00, NULL, 5, 'low_stock', 'active', 'uploads/products/placeholder-8.svg'),
(8, 8, 'Skechers Go Walk Slipper', 'skechers-go-walk-slipper', 'SK-GW-008', 'Memory foam slipper for indoor comfort.', 'Textile', 'Grey', '7,8,9,10', 2999.00, NULL, 20, 0, 'out_of_stock', 'active', 'uploads/products/placeholder-7.svg');

INSERT INTO product_images (product_id, image_path, sort_order) VALUES
(1, 'uploads/products/placeholder-1.svg', 0),
(2, 'uploads/products/placeholder-2.svg', 0),
(3, 'uploads/products/placeholder-3.svg', 0),
(4, 'uploads/products/placeholder-4.svg', 0),
(5, 'uploads/products/placeholder-5.svg', 0),
(6, 'uploads/products/placeholder-6.svg', 0),
(7, 'uploads/products/placeholder-8.svg', 0),
(8, 'uploads/products/placeholder-7.svg', 0);

INSERT INTO feedback (user_id, name, email, subject, message) VALUES
(NULL, 'Visitor', 'visitor@test.com', 'Great catalog', 'Loved the variety of brands on the site.');
