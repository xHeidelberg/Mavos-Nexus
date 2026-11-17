<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('employees', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->nullable()->unique()->constrained('users'); // optional link to a login account
            $t->foreignId('branch_id')->constrained('branches');
            $t->string('full_name', 120);
            $t->string('position', 80)->nullable();
            $t->string('contact_number', 30)->nullable();
            $t->text('address')->nullable();
            $t->date('date_hired')->nullable();
            $t->string('tin', 20)->nullable();

            // Pay
            $t->string('pay_basis', 10);                 // monthly | daily
            $t->decimal('rate', 12, 2);                  // monthly salary, or daily rate
            $t->string('pay_frequency', 12);             // weekly | semi_monthly | monthly

            // How they are paid
            $t->string('payment_method', 10)->default('cash'); // cash | gcash | maya
            $t->string('ewallet_number', 20)->nullable();
            $t->string('ewallet_account_name', 100)->nullable();

            // Government deductions: asked first, or "set up later" (pending)
            $t->string('deductions_status', 12)->default('pending'); // pending | configured
            $t->boolean('sss_enabled')->default(false);
            $t->string('sss_number', 20)->nullable();
            $t->decimal('sss_fixed_amount', 12, 2)->nullable();       // null = computed from rates
            $t->boolean('philhealth_enabled')->default(false);
            $t->string('philhealth_number', 20)->nullable();
            $t->decimal('philhealth_fixed_amount', 12, 2)->nullable();
            $t->boolean('pagibig_enabled')->default(false);
            $t->string('pagibig_number', 20)->nullable();
            $t->decimal('pagibig_fixed_amount', 12, 2)->nullable();

            $t->boolean('is_active')->default(true);
            $t->timestamps();
            $t->index(['branch_id', 'is_active']);
        });

        Schema::create('payroll_runs', function (Blueprint $t) {
            $t->id();
            $t->foreignId('branch_id')->nullable()->constrained('branches'); // null = all branches
            $t->string('pay_frequency', 12);
            $t->date('period_start');
            $t->date('period_end');
            $t->date('pay_date');
            $t->string('status', 10)->default('draft');    // draft | finalized
            $t->text('notes')->nullable();
            $t->foreignId('created_by')->constrained('users');
            $t->foreignId('finalized_by')->nullable()->constrained('users');
            $t->timestamp('finalized_at')->nullable();
            $t->timestamps();
        });

        Schema::create('payslips', function (Blueprint $t) {
            $t->id();
            $t->foreignId('run_id')->constrained('payroll_runs')->cascadeOnDelete();
            $t->foreignId('employee_id')->constrained('employees');
            $t->decimal('days_worked', 6, 2)->nullable();   // for daily-paid employees
            $t->decimal('basic_pay', 12, 2);
            $t->decimal('allowances', 12, 2)->default(0);
            $t->decimal('gross_pay', 12, 2);
            $t->decimal('sss', 12, 2)->default(0);
            $t->decimal('philhealth', 12, 2)->default(0);
            $t->decimal('pagibig', 12, 2)->default(0);
            $t->decimal('other_deductions', 12, 2)->default(0);   // cash advance, etc.
            $t->string('other_deductions_note', 120)->nullable();
            $t->decimal('total_deductions', 12, 2)->default(0);
            $t->decimal('net_pay', 12, 2);
            $t->boolean('deductions_pending')->default(false);    // government deductions not set up yet
            // Snapshot of how to pay, taken when the run was created
            $t->string('payment_method', 10);
            $t->string('ewallet_number', 20)->nullable();
            $t->string('ewallet_account_name', 100)->nullable();
            $t->timestamp('paid_at')->nullable();
            $t->foreignId('paid_by')->nullable()->constrained('users');
            $t->string('payment_reference', 60)->nullable();      // GCash / Maya reference
            $t->timestamps();
            $t->unique(['run_id', 'employee_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payslips');
        Schema::dropIfExists('payroll_runs');
        Schema::dropIfExists('employees');
    }
};
