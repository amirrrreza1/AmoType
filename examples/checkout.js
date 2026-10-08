const price = 24;
const quantity = 3;
const subtotal = price * quantity;

let discount = 5;
discount = 'five';

/**
 * @param {number} total
 * @returns {number}
 */
function withTax(total) {
  return total * 1.09;
}

const finalTotal = withTax('72');
