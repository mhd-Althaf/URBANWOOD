function addToWishlist(productId) {
    fetch('/add-to-wishlist', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ productId })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Show success message
            alert('Added to wishlist!');
        } else {
            // Show error message
            alert('Failed to add to wishlist');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert('An error occurred');
    });
} 