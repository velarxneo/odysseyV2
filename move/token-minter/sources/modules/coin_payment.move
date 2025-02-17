/// This module allows users to create recurring payments for services, fees, or subscriptions in any type of coin.
/// The `CoinPayment<T>` struct holds the details of such payments, including the amount, recipient, and payment category.
///
/// # Features
/// - Users can create recurring payment instructions to be executed as needed.
/// - Only the owner of the `CoinPayment<T>` can destroy it.
/// - All payment executions emit events that can be tracked and audited.
/// - Payments can be categorized (e.g., mint fees, subscription fees), making it easier to manage and report financial activities.
///
/// # Usage
///
/// # Notes
/// `CoinPayment<T>` must not be used in function parameters or return types,
///  as the value can be changed by anyone with reference to it.
///
/// `CoinPayment<T>` acts as a contract which holds the details of a payment instruction.
///
/// # Example
/// ```
/// Create a recurring payment instruction for a subscription fee.
/// let payment = coin_payment::create<T>(owner, 100, recipient_address, "Subscription Fee");
///
/// // Execute the payment when due.
/// coin_payment::execute<T>(&signer, &payment);
///
/// // Optionally, destroy the payment instruction when the subscription ends, or if the payment is a one time payment.
/// coin_payment::destroy<T>(&signer, payment);
/// ```
///
module minter::coin_payment {

    use std::error;
    use std::signer;
    use std::string::String;
    use aptos_framework::coin;
    use aptos_framework::event;

    /// Amount must be greater than zero.
    const EINVALID_AMOUNT: u64 = 1;
    /// Insufficient coin balance to make the payment.
    const EINSUFFICIENT_BALANCE: u64 = 2;
    /// The caller is not the owner of the coin payment.
    const ENOT_OWNER: u64 = 3;

    struct CoinPayment<phantom T> has store {
        /// The amount of coin to be paid.
        amount: u64,
        /// The address to which the coin is to be paid to.
        destination: address,
        /// The category of this payment, e.g. mint fee, launchpad fee
        category: String,
    }

    #[event]
    /// Event emitted when a coin payment of type `T` is made.
    struct CoinPaymentEvent<phantom T> has drop, store {
        from: address,
        amount: u64,
        destination: address,
        category: String,
    }

    /// Creates a new `CoinPayment<T>` instance which is to be stored in a data structure for future reference.
    /// `CoinPayment<T>` acts as a contract which holds the details of a payment instruction.
    /// `CoinPayment<T>` must not be used in function parameters or return types,
    /// as the value can be changed by anyone with reference to it.
    public fun create<T>(amount: u64, destination: address, category: String): CoinPayment<T> {
        assert!(amount > 0, error::invalid_argument(EINVALID_AMOUNT));
        CoinPayment<T> { amount, destination, category }
    }

    public fun execute<T>(minter: &signer, coin_payment: &CoinPayment<T>) {
        let amount = amount(coin_payment);
        let from = signer::address_of(minter);
        assert!(
            coin::balance<T>(from) >= amount,
            error::invalid_state(EINSUFFICIENT_BALANCE),
        );

        let destination = destination(coin_payment);
        coin::transfer<T>(minter, destination, amount);

        event::emit(CoinPaymentEvent<T> {
            from,
            amount,
            destination,
            category: category(coin_payment),
        });
    }

    public fun destroy<T>(coin_payment: CoinPayment<T>) {
        let CoinPayment { amount: _, destination: _, category: _ } = coin_payment;
    }

    public fun amount<T>(coin_payment: &CoinPayment<T>): u64 {
        coin_payment.amount
    }

    public fun destination<T>(coin_payment: &CoinPayment<T>): address {
        coin_payment.destination
    }

    public fun category<T>(coin_payment: &CoinPayment<T>): String {
        coin_payment.category
    }

    public fun set_amount<T>(coin_payment: &mut CoinPayment<T>, amount: u64) {
        coin_payment.amount = amount;
    }

    public fun set_destination<T>(coin_payment: &mut CoinPayment<T>, destination: address) {
        coin_payment.destination = destination;
    }

    public fun set_category<T>(coin_payment: &mut CoinPayment<T>, category: String) {
        coin_payment.category = category;
    }
}
