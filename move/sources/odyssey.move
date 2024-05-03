module minter::odyssey_v2 {

    use std::option;
    use std::option::Option;
    use std::signer;
    use std::string::{Self, String, utf8};
    use std::vector;
    use aptos_std::simple_map;
    use aptos_std::simple_map::SimpleMap;
    use aptos_std::smart_table;
    use aptos_std::smart_table::SmartTable;
    use aptos_std::math64::pow;

    use aptos_framework::coin;
    use aptos_framework::aptos_coin;


    use aptos_framework::aptos_coin::AptosCoin;
    use aptos_framework::object;
    use aptos_framework::object::{ConstructorRef, ExtendRef, Object};

    use aptos_token_objects::collection;
    use aptos_token_objects::collection::Collection;
    use aptos_token_objects::royalty;
    use aptos_token_objects::token;
    use aptos_token_objects::token::Token;

    use minter::coin_payment;
    use minter::coin_payment::CoinPayment;
    use minter::collection_components;
    use minter::mint_stage::{Self};
    use minter::token_components;

    use pyth::pyth;
    use pyth::price_identifier;
    use pyth::i64;
    use pyth::price::{Self,Price};

    const INVALID_SIGNER: u64 = 0;
    const MINT_LIMIT_EXCEED: u64 = 1;
    const INVALID_ROYALTY_NUMERATOR_DENOMINATOR: u64 = 2;
    const INVALID_PUBLIC_MINT_TIME: u64 = 3;
    const INVALID_PRESALES_MINT_TIME: u64 = 4;
    const PRE_SALE_NOT_STARTED: u64 = 5;
    const PRE_SALE_ENDED: u64 = 6;
    const PUBLIC_SALE_NOT_STARTED: u64 = 7;
    const PUBLIC_SALE_ENDED: u64 = 8;
    const PAUSED: u64 = 9;
    const SOLD_OUT: u64 = 10;
    const INVALID_PROOF: u64 = 11;
    const TOKEN_DOES_NOT_EXIST: u64 = 12;
    const NOT_CREATOR: u64 = 13;
    /// No active stages present.
    const ENO_ACTIVE_STAGES: u64 = 14;
    /// The coin payment category does not exist.
    const ECOIN_PAYMENT_CATEGORY_DOES_NOT_EXIST: u64 = 15;
    /// The mint stage does not exist.
    const EMINT_STAGE_DOES_NOT_EXIST: u64 = 16;
    /// The mint fee is not greater than the Odyssey fee.
    const EMINT_FEE_NOT_ENOUGH: u64 = 17;

    // For the entire list of price_ids head to https://pyth.network/developers/price-feed-ids/#pyth-cross-chain-testnet
    // APTOS_USD Testnet address 
    const APTOS_USD_PRICE_FEED_IDENTIFIER : vector<u8> = x"44a93dddd8effa54ea51076c4e851b6cbbfd938e82eb90197de38fe8876bb66e";

    // APTOS_USD Mainnet address 
    //const APTOS_USD_PRICE_FEED_IDENTIFIER : vector<u8> = x"03ae4db29ed4ae33d323568895aa00337e658e348b37509f5372ae51f0af00d5";

    const OdysseyAddress: address = @0x93680d0ecdee118d5eb30b719412b07284b9a52a48c5f1cb9a24972e32cbbb38;
    const Odyssey_fee: u64 = 10000000;

    /// Octas per aptos coin
    const OCTAS_PER_APTOS: u64 = 100000000;

    const PRESALE_MINT_STAGE_CATEGORY: vector<u8> = b"Presale mint stage";
    const PUBLIC_SALE_MINT_STAGE_CATEGORY: vector<u8> = b"Public sale mint stage";
    const PRESALE_COIN_PAYMENT_CATEGORY: vector<u8> = b"Presale mint fee";
    const PUBLIC_SALE_COIN_PAYMENT_CATEGORY: vector<u8> = b"Public sale mint fee";
    const ODYSSEY_FEE_CATEGORY: vector<u8> = b"Odyssey fee";

    #[resource_group_member(group = aptos_framework::object::ObjectGroup)]
    struct Odyssey has key {
        extend_ref: ExtendRef,
        odyssey_name: String,
    }

    #[resource_group_member(group = aptos_framework::object::ObjectGroup)]
    struct OdysseyMintData has key {
        collection: Object<Collection>,
        description: String,
        cover: String,
        collection_size: u64,
        paused: bool,
        minted: u64,
        // fees: vector<CoinPayment<AptosCoin>>,
        /// Stage to mint fees mapping
        fees: SimpleMap<String, vector<CoinPayment<AptosCoin>>>,
        minters: SmartTable<address, u64>,
    }

    #[event]
    struct UpdateOdysseyEvent has drop, store {
        presale_start_time: u64,
        presale_end_time: u64,
        presale_mint_fee: u64,
        public_sales_start_time: u64,
        public_sales_end_time: u64,
        public_sales_mint_fee: u64,
    }

    #[resource_group_member(group = aptos_framework::object::ObjectGroup)]
    /// Object to represent all trait types and trait values config records
    struct TraitConfigList has key {
        trait_configs: vector<TraitConfig>
    }

    /// Struct to represent one single trait value config record
    struct TraitConfig has store, copy, drop {
        trait_type: String,
        trait_value: String,
        probability: u16
    }

    #[resource_group_member(group = aptos_framework::object::ObjectGroup)]
    /// Object to represent tokens with their respective trait types and trait values
    struct TokenTraitValueList has key {
        token_trait_values: vector<TokenTraitValue>
    }

    /// Struct to represent one token with a trait type and trait value config record
    struct TokenTraitValue has store {
        token_id: u64,
        trait_type: String,
        trait_value: String
    }

    public entry fun create_odyssey(
        owner: &signer,
        odyssey_name: String,
        collection_name: String,
        description: String,
        cover: String,
        collection_size: u64,
        royalty_numerator: u64,
        royalty_denominator: u64,
        presale_start_time: u64,
        presale_end_time: u64,
        presale_mint_fee: u64,
        public_sales_start_time: u64,
        public_sales_end_time: u64,
        public_sales_mint_fee: u64,
        public_max_mint: u64,
        royalty_payee_address: address,
    ) {
        assert!(
            presale_start_time == 0 ||
                (presale_end_time < public_sales_start_time && presale_start_time < presale_end_time),
            INVALID_PRESALES_MINT_TIME,
        );

        // Create odyssey object
        let odyssey_constructor_ref = &object::create_object_from_account(owner);
        let odyssey_signer = &object::generate_signer(odyssey_constructor_ref);

        let collection = create_collection(
            odyssey_signer,
            royalty_numerator,
            royalty_denominator,
            royalty_payee_address,
            collection_name,
            description,
            cover,
            collection_size,
        );

        create_stages(
            odyssey_constructor_ref,
            presale_start_time,
            public_sales_start_time,
            presale_end_time,
            public_sales_end_time,
            public_max_mint
        );

        create_odyssey_object_and_mint_data(
            owner,
            odyssey_signer,
            collection,
            description,
            cover,
            collection_size,
            presale_mint_fee,
            public_sales_mint_fee,
            odyssey_name,
            object::generate_extend_ref(odyssey_constructor_ref),
        );
    }

    fun create_stages(
        odyssey_constructor_ref: &ConstructorRef,
        presale_start_time: u64,
        public_sales_start_time: u64,
        presale_end_time: u64,
        public_sales_end_time: u64,
        public_max_mint: u64
    ) {
        mint_stage::init(
            odyssey_constructor_ref,
            presale_start_time,
            presale_end_time,
            utf8(PRESALE_MINT_STAGE_CATEGORY),
            option::none(),
        );
        mint_stage::init(
            odyssey_constructor_ref,
            public_sales_start_time,
            public_sales_end_time,
            utf8(PUBLIC_SALE_MINT_STAGE_CATEGORY),
            option::some(public_max_mint),
        );
    }

    fun create_collection(
        odyssey_signer: &signer,
        royalty_numerator: u64,
        royalty_denominator: u64,
        royalty_payee_address: address,
        collection_name: String,
        description: String,
        cover: String,
        collection_size: u64,
    ): Object<Collection> {
        let royalty = royalty::create(
            royalty_numerator,
            royalty_denominator,
            royalty_payee_address,
        );
        let collection_constructor_ref = &collection::create_fixed_collection(
            odyssey_signer,
            description,
            collection_size,
            collection_name,
            option::some(royalty),
            cover,
        );
        let refs = collection_components::create_refs_and_properties(collection_constructor_ref);
        object::convert(refs)
    }

    fun create_odyssey_object_and_mint_data(
        owner: &signer,
        odyssey: &signer,
        collection: Object<Collection>,
        description: String,
        cover: String,
        collection_size: u64,
        presale_mint_fee: u64,
        public_sales_mint_fee: u64,
        odyssey_name: String,
        extend_ref: ExtendRef,
    ) {
        move_to(odyssey, Odyssey { extend_ref, odyssey_name });

        let fees = simple_map::new();
        let presale_fees = create_fees<AptosCoin>(
            owner,
            presale_mint_fee,
            utf8(PRESALE_COIN_PAYMENT_CATEGORY),
        );
        simple_map::add(&mut fees, utf8(PRESALE_MINT_STAGE_CATEGORY), presale_fees);

        let public_sale_fees = create_fees<AptosCoin>(
            owner,
            public_sales_mint_fee,
            utf8(PUBLIC_SALE_COIN_PAYMENT_CATEGORY),
        );
        simple_map::add(&mut fees, utf8(PUBLIC_SALE_MINT_STAGE_CATEGORY), public_sale_fees);

        move_to(odyssey, OdysseyMintData {
            collection,
            description,
            cover,
            collection_size,
            paused: false,
            minted: 0,
            fees,
            minters: smart_table::new(),
        });
    }

    fun create_fees<T>(
        owner: &signer,
        mint_fee: u64,
        fee_category: String,
    ): vector<CoinPayment<T>> {
        let coin_payments = vector[];

        if (mint_fee > 0) {
            assert!(mint_fee >= Odyssey_fee, EMINT_FEE_NOT_ENOUGH);

            let odyssey_fee = coin_payment::create<T>(
                Odyssey_fee,
                OdysseyAddress,
                utf8(ODYSSEY_FEE_CATEGORY)
            );

            let mint_fee = coin_payment::create<T>(
                mint_fee - Odyssey_fee,
                signer::address_of(owner),
                fee_category,
            );
            vector::push_back(&mut coin_payments, odyssey_fee);
            vector::push_back(&mut coin_payments, mint_fee);
        };

        coin_payments
    }

    /// Public mint function, which allows anyone to call to mint a token.
    /// All stages of the minting process are verified prior to minting.
    public entry fun mint_to(
        minter: &signer,
        odyssey_obj: Object<OdysseyMintData>,
        to_address: address,
        uri: String,
        minting_qty: u64,
        vaas : vector<vector<u8>>
    ) acquires Odyssey, OdysseyMintData {
        if (minting_qty <= 0) return;  // Base case for recursion
        let odyssey_signer = &odyssey_signer(odyssey_obj);
        let stage = &mint_stage::execute_earliest_stage(minter, odyssey_obj, 1);
        assert!(option::is_some(stage), ENO_ACTIVE_STAGES);

        let mint_data = borrow_mut_mint_data(odyssey_obj);
        
        let price_in_aptos_coin = update_and_fetch_price(minter, vaas);
        
        let old_odyssey_price = 0;
        let new_mint_fee = 0;

        let fees = simple_map::borrow_mut(&mut mint_data.fees, &utf8(PRESALE_MINT_STAGE_CATEGORY));
            
        if (check_fees_exist_by_category(fees, utf8(ODYSSEY_FEE_CATEGORY)))
        {
            let coin_payment = find_fees_by_category(fees, utf8(ODYSSEY_FEE_CATEGORY));
            old_odyssey_price = coin_payment::amount(coin_payment);
            coin_payment::set_amount(coin_payment, price_in_aptos_coin);

            coin_payment = find_fees_by_category(fees, utf8(PRESALE_COIN_PAYMENT_CATEGORY));
            new_mint_fee = coin_payment::amount(coin_payment) + old_odyssey_price - price_in_aptos_coin;
            coin_payment::set_amount(coin_payment, new_mint_fee);
        };

        let public_fees = simple_map::borrow_mut(&mut mint_data.fees, &utf8(PUBLIC_SALE_MINT_STAGE_CATEGORY));

        if (check_fees_exist_by_category(public_fees, utf8(ODYSSEY_FEE_CATEGORY)))
        {
            let coin_payment = find_fees_by_category(public_fees, utf8(ODYSSEY_FEE_CATEGORY));
            coin_payment::set_amount(coin_payment, price_in_aptos_coin);

            coin_payment = find_fees_by_category(public_fees, utf8(PUBLIC_SALE_COIN_PAYMENT_CATEGORY));
            new_mint_fee = coin_payment::amount(coin_payment) + old_odyssey_price - price_in_aptos_coin;
            coin_payment::set_amount(coin_payment, new_mint_fee);
        };
       
        let stage_fees = simple_map::borrow(&mut mint_data.fees, option::borrow(stage));

      
        // Take fee payment from `minter` prior to minting
        vector::for_each_ref(stage_fees, |fee| {
            coin_payment::execute(minter, fee)
        });

        let minted_amount = smart_table::borrow_mut_with_default(&mut mint_data.minters, to_address, 0);
        *minted_amount = *minted_amount + 1;

        let token_name = collection::name(mint_data.collection);
        string::append(&mut token_name, string::utf8(b" #"));
        string::append(&mut token_name, num_str(mint_data.minted + 1));

        // Minting NFT
        let token_constructor_ref = &token::create(
            odyssey_signer,
            collection::name(mint_data.collection),
            uri,
            token_name,
            option::none(),
            uri,
        );
        token_components::create_refs(token_constructor_ref);

        // Transfering the NFT to the signer of the transaction
        object::transfer(
            odyssey_signer,
            object::object_from_constructor_ref<Token>(token_constructor_ref),
            to_address,
        );

        mint_data.minted = mint_data.minted + 1;

        mint_to(minter, odyssey_obj, to_address, uri, minting_qty - 1, vaas);
    }

    inline fun authorized_borrow_mut_mint_data(owner: &signer, odyssey: Object<OdysseyMintData>): &mut OdysseyMintData {
        assert_owner(owner, odyssey);
        borrow_mut_mint_data(odyssey)
    }

    inline fun borrow_mut_mint_data(odyssey: Object<OdysseyMintData>): &mut OdysseyMintData {
        borrow_global_mut<OdysseyMintData>(object::object_address(&odyssey))
    }

    inline fun borrow_mint_data<T: key>(odyssey: Object<T>): &OdysseyMintData {
        assert!(exists<OdysseyMintData>(object::object_address(&odyssey)), 21);
        borrow_global<OdysseyMintData>(object::object_address(&odyssey))
    }

    inline fun odyssey_signer<T: key>(odyssey: Object<T>): signer {
        let obj_addr = object::object_address(&odyssey);
        assert!(exists<Odyssey>(obj_addr), 22);

        let extend_ref = &borrow_global<Odyssey>(obj_addr).extend_ref;
        object::generate_signer_for_extending(extend_ref)
    }

    public entry fun set_paused(
        owner: &signer,
        odyssey_mint_data: Object<OdysseyMintData>,
        value: bool,
    ) acquires OdysseyMintData {
        authorized_borrow_mut_mint_data(owner, odyssey_mint_data).paused = value;
    }

    #[view]
    public fun allowlist_balance(
        odyssey: Object<Odyssey>,
        category: String,
        user_addr: address,
    ): u64  {
       mint_stage::allowlist_balance(odyssey, category, user_addr)
    }

    #[view]
    public fun publiclist_balance(
        odyssey: Object<Odyssey>,
        category: String,
        user_addr: address,
    ): u64  {
       let balance_option = mint_stage::user_balance_in_no_allowlist(odyssey, category, user_addr);
        if (option::is_some(&balance_option)) {
            *option::borrow(&balance_option)
        } else {
            9999 
        }
    }

    public entry fun update_odyssey_mint_stage_times(
        owner: &signer,
        odyssey: Object<Odyssey>,
        category: String,
        start_time: u64,
        end_time: u64,
    ) {
        mint_stage::set_start_and_end_time(owner, odyssey, category, start_time, end_time);
    }

    public entry fun update_odyssey_coin_payment(
        owner: &signer,
        odyssey_mint_data: Object<OdysseyMintData>,
        fee_category: String,
        fee: u64,
        destination: address,
        category: String,
    ) acquires OdysseyMintData {
        let mint_data = authorized_borrow_mut_mint_data(owner, odyssey_mint_data);
        let fees = simple_map::borrow_mut(&mut mint_data.fees, &fee_category);
        let odyssey_fee = coin_payment::amount(find_fees_by_category(fees, utf8(ODYSSEY_FEE_CATEGORY)));

        fees = simple_map::borrow_mut(&mut mint_data.fees, &fee_category);
        let coin_payment = find_fees_by_category(fees, category);

        coin_payment::set_amount(coin_payment, fee - odyssey_fee);
        coin_payment::set_destination(coin_payment, destination);
        coin_payment::set_category(coin_payment, category);
    }

    fun find_fees_by_category<T>(fees: &mut vector<CoinPayment<T>>, category: String): &mut CoinPayment<T> {
        let (payment_found, index) = vector::find(fees, |payment| {
            coin_payment::category(payment) == category
        });
        assert!(payment_found, ECOIN_PAYMENT_CATEGORY_DOES_NOT_EXIST);
        vector::borrow_mut(fees, index)
    }

    fun check_fees_exist_by_category<T>(fees: &vector<CoinPayment<T>>, category: String): bool {
        let found = false;
        let len = vector::length(fees);
        let i = 0;

        while (i < len) {
            let payment = vector::borrow(fees, i);
            if (coin_payment::category(payment) == category) {
                found = true;
                break;
            };
            i = i + 1;
        };

        found
    }


    public entry fun update_odyssey_mint_data(
        owner: &signer,
        odyssey_mint_data: Object<OdysseyMintData>,
        collection: Object<Collection>,
        description: String,
        cover: String,
        collection_size: u64,
    ) acquires OdysseyMintData {
        let mint_data = authorized_borrow_mut_mint_data(owner, odyssey_mint_data);
        mint_data.collection = collection;
        mint_data.description = description;
        mint_data.cover = cover;
        mint_data.collection_size = collection_size;
    }

    public entry fun update_odyssey_name(
        owner: &signer,
        odyssey: Object<Odyssey>,
        odyssey_name: String,
    ) acquires Odyssey {
        assert_owner(owner, odyssey);
        borrow_global_mut<Odyssey>(object::object_address(&odyssey)).odyssey_name = odyssey_name;
    }

    public entry fun update_token_uri(
        owner: &signer,
        odyssey: Object<Odyssey>,
        token: Object<Token>,
        uri: String,
    ) acquires Odyssey {
        assert_owner(owner, odyssey);
        token_components::set_uri(&odyssey_signer(odyssey), token, uri);
    }

    /// This function updates the royalty of the collection.
    /// `collection_components` asserts that the `owner` owns the `collection`.
    public entry fun update_collection_royalties(
        owner: &signer,
        odyssey_mint_data: Object<OdysseyMintData>,
        royalty_numerator: u64,
        royalty_denominator: u64,
        payee_address: address,
    ) acquires Odyssey, OdysseyMintData {
        let collection = authorized_borrow_mut_mint_data(owner, odyssey_mint_data).collection;
        let royalty = royalty::create(royalty_numerator, royalty_denominator, payee_address);
        collection_components::set_collection_royalties(&odyssey_signer(odyssey_mint_data), collection, royalty);
    }

    inline fun assert_owner<T: key>(owner: &signer, obj: Object<T>) {
        assert!(object::is_owner(obj, signer::address_of(owner)), NOT_CREATOR);
    }

    public entry fun populate_trait_config(
        owner: &signer,
        odyssey: Object<Odyssey>,
        trait_type: String,
        trait_value: String,
        probability: u16
    ) acquires Odyssey, TraitConfigList {
        assert_owner(owner, odyssey);

        let odyssey_addr = object::object_address(&odyssey);
        if (!exists<TraitConfigList>(odyssey_addr)) {
            move_to(&odyssey_signer(odyssey), TraitConfigList { trait_configs: vector::empty() });
        };

        let traits_config_list_data = borrow_global_mut<TraitConfigList>(odyssey_addr);
        let trait_config = TraitConfig { trait_type, trait_value, probability };
        vector::push_back(&mut traits_config_list_data.trait_configs, trait_config);
    }

    public entry fun clear_trait_config_list(owner: &signer, odyssey: Object<Odyssey>) acquires TraitConfigList {
        assert_owner(owner, odyssey);

        let odyssey_addr = object::object_address(&odyssey);
        let traitsConfigList_data = borrow_global_mut<TraitConfigList>(odyssey_addr);
        vector::for_each(traitsConfigList_data.trait_configs, |traitConfig| {
            let TraitConfig { trait_type: _, trait_value: _, probability: _ } = traitConfig;
        });
    }

    public entry fun add_to_allowlist(
        owner: &signer,
        odyssey: Object<OdysseyMintData>,
        stage: String,
        addrs: vector<address>,
        amounts: vector<u64>,
    ) {
        let addrs_length = vector::length(&addrs);
        assert!(addrs_length == vector::length(&amounts), 0);

        for (i in 0..addrs_length) {
            let addr = *vector::borrow(&addrs, i);
            let amount = *vector::borrow(&amounts, i);
            mint_stage::add_to_allowlist(owner, odyssey, stage, addr, amount);
        };
    }

    public entry fun remove_from_allowlist(
        owner: &signer,
        odyssey: Object<OdysseyMintData>,
        stage: String,
        addrs: vector<address>,
    ) {
        for (i in 0..vector::length(&addrs)) {
            let addr = *vector::borrow(&addrs, i);
            mint_stage::remove_from_allowlist(owner, odyssey, stage, addr);
        };
    }

    /// 2. Call move contract by passing in `token_id` as parameter:
    ///  - This method will loop through each trait config record
    ///  - For every new trait type config record:
    ///      - Generate a random number from 1 to 10,000
    ///      - Based on the random number, obtain the trait value of this trait type
    ///      - Write the token_id, trait type and trait value onchain
    public entry fun generate_token_random_traits(
        owner: &signer,
        odyssey: Object<Odyssey>,
        token_id: u64,
    ) acquires Odyssey, TraitConfigList, TokenTraitValueList {
        assert_owner(owner, odyssey);

        let odyssey_addr = object::object_address(&odyssey);
        if (!exists<TokenTraitValueList>(odyssey_addr)) {
            move_to(&odyssey_signer(odyssey), TokenTraitValueList { token_trait_values: vector::empty() });
        };

        let i = 0;
        let traits_config_list_data = borrow_global<TraitConfigList>(odyssey_addr);
        let length = vector::length(&traits_config_list_data.trait_configs);
        let prev_trait_type = string::utf8(b"");
        let is_new_trait_type = true;
        let accumulated_probability: u16 = 0;
        let random_roll: u16 = 0;
        let skip_trait_type = false;

        while (i < length) {
            let trait_config = *vector::borrow(&traits_config_list_data.trait_configs, i);
            let trait_type = trait_config.trait_type;
            let trait_value = trait_config.trait_value;
            let trait_probability = trait_config.probability;
            if (prev_trait_type == trait_type) {
                // Still on the same TraitType
                is_new_trait_type = false;
                accumulated_probability = accumulated_probability + trait_probability;
                if (skip_trait_type) {
                    // assert!(length == 0, i);
                    i = i + 1;
                    continue;
                };
            } else {
                // New Trait Type
                is_new_trait_type = true;
                skip_trait_type = false;
                accumulated_probability = trait_probability;
                prev_trait_type = trait_type;
            };

            if (is_new_trait_type) {
                // Generate a random number from 1 to 10,000
                random_roll = 6000;
                // random_roll = randomness::u16_range(1, 10001);
            };

            // Check if the random number falls within the probability range
            //
            // If this is false, then we end up not assigning a trait value to the token?
            if (random_roll <= accumulated_probability) {
                // Write token ID, trait type, and trait value on-chain
                let token_trait_value_list_data = borrow_global_mut<TokenTraitValueList>(odyssey_addr);
                let token_trait_value = TokenTraitValue { token_id, trait_type, trait_value };
                vector::push_back(&mut token_trait_value_list_data.token_trait_values, token_trait_value);
                skip_trait_type = true;
            };

            i = i + 1;
        };
    }

    fun num_str(num: u64): String {
        let v1 = vector::empty();
        while (num / 10 > 0) {
            let rem = num % 10;
            vector::push_back(&mut v1, (rem + 48 as u8));
            num = num / 10;
        };
        vector::push_back(&mut v1, (num + 48 as u8));
        vector::reverse(&mut v1);
        string::utf8(v1)
    }

    /// Please read https://docs.pyth.network/documentation/pythnet-price-feeds before using a `Price` in your application
    fun update_and_fetch_price(receiver : &signer,  vaas : vector<vector<u8>>) :u64 {
            let coins = coin::withdraw<aptos_coin::AptosCoin>(receiver, pyth::get_update_fee(&vaas)); // Get coins to pay for the update
            pyth::update_price_feeds(vaas, coins); // Update price feed with the provided vaas
            let price = pyth::get_price(price_identifier::from_byte_vec(APTOS_USD_PRICE_FEED_IDENTIFIER)); // Get recent price (will fail if price is too old)

            let price_positive = i64::get_magnitude_if_positive(&price::get_price(&price)); // This will fail if the price is negative
            let expo_magnitude = i64::get_magnitude_if_negative(&price::get_expo(&price)); // This will fail if the exponent is positive

            (OCTAS_PER_APTOS * pow(10, expo_magnitude)) / price_positive // 1 USD in APT
    }
}