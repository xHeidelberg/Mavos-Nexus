<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        // Sequential receipt counter per branch (BIR-friendly: assigned by the server, no gaps).
        Schema::create('receipt_sequences', function (Blueprint $t) {
            $t->foreignId('branch_id')->primary()->constrained('branches');
            $t->unsignedBigInteger('last_number')->default(0);
        });

        Schema::create('sales', function (Blueprint $t) {
            $t->id();
            $t->string('receipt_no', 30)->unique();
            $t->char('client_uuid', 36)->nullable()->unique();   // idempotency key (offline sync / retries)
            $t->foreignId('branch_id')->constrained('branches');
            $t->foreignId('cashier_id')->constrained('users');
            $t->foreignId('customer_id')->nullable()->constrained('customers');
            $t->string('payment_method', 10);                    // cash | gcash
            $t->string('gcash_ref', 40)->nullable()->index();
            $t->decimal('subtotal', 12, 2);                      // at list price
            $t->decimal('discount_total', 12, 2)->default(0);
            $t->decimal('total', 12, 2);
            $t->decimal('amount_tendered', 12, 2);
            $t->decimal('change_given', 12, 2)->default(0);
            $t->string('status', 10)->default('completed');      // completed | voided
            $t->boolean('needs_review')->default(false)->index();
            $t->text('review_reason')->nullable();
            $t->boolean('is_offline_sync')->default(false);
            $t->string('device_info', 200)->nullable();
            $t->timestamp('sold_at')->useCurrent();              // device time for offline sales
            $t->timestamp('created_at')->useCurrent();           // when the server stored it
            $t->index(['branch_id', 'sold_at']);
            $t->index(['cashier_id', 'sold_at']);
        });

        // One row per (variant, batch) allocation so voids/exchanges restore the exact batch.
        Schema::create('sale_items', function (Blueprint $t) {
            $t->id();
            $t->foreignId('sale_id')->constrained('sales')->cascadeOnDelete();
            $t->foreignId('variant_id')->constrained('product_variants');
            $t->foreignId('batch_id')->nullable()->constrained('stock_batches');
            $t->unsignedInteger('qty');
            $t->decimal('list_price', 12, 2);
            $t->decimal('unit_price', 12, 2);   // actual price after seller negotiation
            $t->decimal('base_price', 12, 2);   // floor at time of sale (snapshot)
            $t->decimal('unit_cost', 12, 2);    // puhunan at time of sale (snapshot)
            $t->decimal('line_total', 12, 2);
        });

        Schema::create('voids', function (Blueprint $t) {
            $t->id();
            $t->foreignId('sale_id')->unique()->constrained('sales');
            $t->text('reason');
            $t->foreignId('voided_by')->constrained('users');
            $t->foreignId('approved_by')->constrained('users');
            $t->foreignId('replacement_sale_id')->nullable()->constrained('sales'); // corrected re-entry
            $t->timestamp('created_at')->useCurrent();
        });

        // No refunds: exchange only. Customer pays any positive difference.
        Schema::create('exchanges', function (Blueprint $t) {
            $t->id();
            $t->foreignId('original_sale_id')->constrained('sales');
            $t->foreignId('branch_id')->constrained('branches');
            $t->foreignId('processed_by')->constrained('users');
            $t->foreignId('approved_by')->constrained('users');
            $t->decimal('price_difference', 12, 2);
            $t->string('payment_method', 10)->nullable();
            $t->string('gcash_ref', 40)->nullable();
            $t->text('note')->nullable();
            $t->timestamp('created_at')->useCurrent();
        });

        Schema::create('exchange_items', function (Blueprint $t) {
            $t->id();
            $t->foreignId('exchange_id')->constrained('exchanges')->cascadeOnDelete();
            $t->string('direction', 10);        // returned | given
            $t->foreignId('sale_item_id')->nullable()->constrained('sale_items');
            $t->foreignId('variant_id')->constrained('product_variants');
            $t->foreignId('batch_id')->nullable()->constrained('stock_batches');
            $t->unsignedInteger('qty');
            $t->decimal('unit_price', 12, 2);
            $t->decimal('unit_cost', 12, 2);
        });

        Schema::create('loyalty_ledger', function (Blueprint $t) {
            $t->id();
            $t->foreignId('customer_id')->constrained('customers');
            $t->foreignId('sale_id')->nullable()->constrained('sales');
            $t->integer('points');
            $t->string('reason', 60);
            $t->timestamp('created_at')->useCurrent();
        });

        Schema::create('expenses', function (Blueprint $t) {
            $t->id();
            $t->foreignId('branch_id')->constrained('branches');
            $t->string('category', 60);
            $t->text('description')->nullable();
            $t->decimal('amount', 12, 2);
            $t->date('expense_date');
            $t->foreignId('created_by')->constrained('users');
            $t->timestamps();
            $t->index(['branch_id', 'expense_date']);
        });
    }

    public function down(): void
    {
        foreach (['expenses', 'loyalty_ledger', 'exchange_items', 'exchanges', 'voids', 'sale_items', 'sales', 'receipt_sequences'] as $t) {
            Schema::dropIfExists($t);
        }
    }
};
