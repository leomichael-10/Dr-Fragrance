// Global variables
let allProducts = [];
let cart = JSON.parse(localStorage.getItem('cart')) || [];
let currentFilter = 'all';

// ============================================
// INITIALIZATION
// ============================================

// Load products when page loads
document.addEventListener('DOMContentLoaded', () => {
    // Check if we're on the index page
    if (document.getElementById('products-grid')) {
        loadProducts();
        setupFilterButtons();
    }
    
    // Check if we're on the checkout page
    if (document.getElementById('cart-items')) {
        displayCart();
        setupCheckoutForm();
    }

    // Update cart count
    updateCartCount();
});

// ============================================
// PRODUCT LOADING & DISPLAY
// ============================================

/**
 * Load products from perfumes.json file
 */
async function loadProducts() {
    try {
        const response = await fetch('/perfumes');
        const data = await response.json();
        
        if (data.success && data.data) {
            allProducts = data.data;
            renderProducts(allProducts);
        } else {
            console.error('Failed to load products');
        }
    } catch (error) {
        console.error('Error loading products:', error);
    }
}

/**
 * Render products to the grid
 */
function renderProducts(products) {
    const grid = document.getElementById('products-grid');
    
    if (products.length === 0) {
        grid.innerHTML = '<p class="no-products">No products found.</p>';
        return;
    }

    grid.innerHTML = products.map(product => `
        <div class="product-card">
            <div class="product-image">
                <span class="brand-badge">${product.brand}</span>
            </div>
            <div class="product-info">
                <h3>${product.name}</h3>
                <p class="product-brand">${product.brand}</p>
                <p class="product-description">${product.description}</p>
                <div class="product-footer">
                    <div class="product-details">
                        <span class="product-size">${product.size}</span>
                        <span class="product-category">${product.category}</span>
                    </div>
                    <div class="product-price">$${product.price}</div>
                </div>
                <button class="add-to-cart-btn" onclick="addToCart(${product.id})">
                    Add to Cart
                </button>
            </div>
        </div>
    `).join('');
}

// ============================================
// FILTERING
// ============================================

/**
 * Setup filter buttons
 */
function setupFilterButtons() {
    const filterButtons = document.querySelectorAll('.filter-btn');
    
    filterButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            // Update active state
            filterButtons.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            // Filter products
            currentFilter = this.dataset.filter;
            filterProducts(currentFilter);
        });
    });
}

/**
 * Filter products by category
 */
function filterProducts(category) {
    if (category === 'all') {
        renderProducts(allProducts);
    } else {
        const filtered = allProducts.filter(p => p.category === category);
        renderProducts(filtered);
    }
}

// ============================================
// CART MANAGEMENT
// ============================================

/**
 * Add product to cart
 */
function addToCart(productId) {
    const product = allProducts.find(p => p.id === productId);
    
    if (!product) return;

    // Check if product already in cart
    const existingItem = cart.find(item => item.id === productId);
    
    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        cart.push({
            ...product,
            quantity: 1
        });
    }

    // Save to localStorage
    localStorage.setItem('cart', JSON.stringify(cart));
    
    // Update cart count
    updateCartCount();
    
    // Show feedback
    showNotification(`${product.name} added to cart!`);
}

/**
 * Remove item from cart
 */
function removeFromCart(productId) {
    cart = cart.filter(item => item.id !== productId);
    localStorage.setItem('cart', JSON.stringify(cart));
    
    updateCartCount();
    displayCart();
}

/**
 * Update cart count badge
 */
function updateCartCount() {
    const countElement = document.getElementById('cart-count');
    if (countElement) {
        const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
        countElement.textContent = totalItems;
    }
}

/**
 * Calculate total price
 */
function calculateTotal() {
    return cart.reduce((total, item) => total + (item.price * item.quantity), 0);
}

/**
 * Display cart items on checkout page
 */
function displayCart() {
    const cartItemsElement = document.getElementById('cart-items');
    const cartTotalElement = document.getElementById('cart-total');
    
    if (cart.length === 0) {
        cartItemsElement.innerHTML = '<p class="empty-cart">Your cart is empty.</p>';
        cartTotalElement.textContent = '0.00';
        return;
    }

    cartItemsElement.innerHTML = cart.map(item => `
        <div class="cart-item">
            <div class="cart-item-info">
                <h4>${item.name}</h4>
                <p class="cart-item-brand">${item.brand} - ${item.size}</p>
                <p class="cart-item-price">$${item.price} x ${item.quantity}</p>
            </div>
            <button class="remove-btn" onclick="removeFromCart(${item.id})">Remove</button>
        </div>
    `).join('');

    cartTotalElement.textContent = calculateTotal().toFixed(2);
}

// ============================================
// CHECKOUT FORM
// ============================================

/**
 * Setup checkout form submission
 */
function setupCheckoutForm() {
    const form = document.getElementById('checkout-form');
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Validate cart is not empty
        if (cart.length === 0) {
            alert('Your cart is empty!');
            return;
        }

        // Get form data
        const formData = {
            name: document.getElementById('name').value,
            phone: document.getElementById('phone').value,
            deliveryAddress: document.getElementById('address').value,
            payment: document.getElementById('payment').value,
        };

        // Validate all fields
        if (!formData.name || !formData.phone || !formData.deliveryAddress || !formData.payment) {
            alert('Please fill in all fields');
            return;
        }

        // For each cart item, submit order to backend
        try {
            for (const item of cart) {
                await submitOrder({
                    name: formData.name,
                    phone: formData.phone,
                    perfumeId: item.id,
                    quantity: item.quantity,
                    deliveryAddress: formData.deliveryAddress
                });
            }

            // Show success message
            showSuccessMessage();
            
            // Clear cart
            cart = [];
            localStorage.removeItem('cart');
            updateCartCount();
            
            // Reset form
            form.reset();
            
            // Clear cart display
            displayCart();
            
        } catch (error) {
            console.error('Error submitting order:', error);
            alert('Failed to place order. Please try again.');
        }
    });
}

/**
 * Submit order to backend
 */
async function submitOrder(orderData) {
    const response = await fetch('/order-perfume', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(orderData)
    });

    const result = await response.json();
    
    if (!result.success) {
        throw new Error(result.message);
    }
    
    return result;
}

/**
 * Show success message
 */
function showSuccessMessage() {
    const messageElement = document.getElementById('success-message');
    messageElement.textContent = '✅ Order placed successfully! Thank you for your purchase.';
    messageElement.style.display = 'block';
    
    // Hide after 5 seconds
    setTimeout(() => {
        messageElement.style.display = 'none';
    }, 5000);
}

/**
 * Show notification
 */
function showNotification(message) {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.remove();
    }, 3000);
}
