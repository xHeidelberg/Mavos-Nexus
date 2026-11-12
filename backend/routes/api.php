<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CatalogController;
use App\Http\Controllers\Api\MiscController;
use App\Http\Controllers\Api\ProductController;
use App\Http\Controllers\Api\ReportController;
use App\Http\Controllers\Api\SaleController;
use App\Http\Controllers\Api\StockController;
use App\Http\Controllers\Api\TransferController;
use App\Http\Controllers\Api\UserController;
use Illuminate\Support\Facades\Route;

// Public
Route::post('auth/login', [AuthController::class, 'login'])->middleware('throttle:20,15');

Route::middleware(['auth:sanctum', 'password.changed'])->group(function () {
    // Auth
    Route::get('auth/me', [AuthController::class, 'me'])->name('auth.me');
    Route::post('auth/logout', [AuthController::class, 'logout'])->name('auth.logout');
    Route::post('auth/change-password', [AuthController::class, 'changePassword'])->name('auth.change-password');
    Route::post('auth/pin', [AuthController::class, 'setPin'])->middleware('role:staff,admin');

    // Users
    Route::get('users', [UserController::class, 'index'])->middleware('role:admin,staff');
    Route::middleware('role:admin')->group(function () {
        Route::post('users', [UserController::class, 'store']);
        Route::patch('users/{user}', [UserController::class, 'update']);
        Route::post('users/{user}/reset-password', [UserController::class, 'resetPassword']);
    });

    // Catalog
    Route::get('branches', [CatalogController::class, 'branches']);
    Route::get('categories', [CatalogController::class, 'categories']);
    Route::get('products', [ProductController::class, 'index']);
    Route::get('products/{product}', [ProductController::class, 'show']);
    Route::get('customers', [CatalogController::class, 'customers']);
    Route::post('customers', [CatalogController::class, 'storeCustomer']);
    Route::middleware('role:admin,staff')->group(function () {
        Route::patch('customers/{customer}', [CatalogController::class, 'updateCustomer']);
        Route::get('suppliers', [CatalogController::class, 'suppliers']);
        Route::post('suppliers', [CatalogController::class, 'storeSupplier']);
        Route::patch('suppliers/{supplier}', [CatalogController::class, 'updateSupplier']);
    });
    Route::middleware('role:admin')->group(function () {
        Route::post('branches', [CatalogController::class, 'storeBranch']);
        Route::patch('branches/{branch}', [CatalogController::class, 'updateBranch']);
        Route::post('categories', [CatalogController::class, 'storeCategory']);
        Route::patch('categories/{category}', [CatalogController::class, 'updateCategory']);
        Route::post('products', [ProductController::class, 'store']);
        Route::patch('products/{product}', [ProductController::class, 'update']);
    });

    // Stock
    Route::get('stock', [StockController::class, 'index']);
    Route::get('stock/low', [StockController::class, 'low']);
    Route::post('stock/adjustments', [StockController::class, 'adjust']); // any role, needs approver PIN
    Route::middleware('role:admin,staff')->group(function () {
        Route::get('stock/expiring', [StockController::class, 'expiring']);
        Route::get('stock/movements', [StockController::class, 'movements']);
        Route::post('stock/receive', [StockController::class, 'receive']);
        Route::get('stock/transfers', [TransferController::class, 'index']);
        Route::post('stock/transfers/{id}/receive', [TransferController::class, 'receive']);
    });
    Route::middleware('role:admin')->group(function () {
        Route::post('stock/transfers', [TransferController::class, 'store']);
        Route::post('stock/transfers/{id}/cancel', [TransferController::class, 'cancel']);
    });

    // Sales / POS
    Route::get('sales', [SaleController::class, 'index']);
    Route::get('sales/export', [SaleController::class, 'export']);
    Route::post('sales', [SaleController::class, 'store']);
    Route::post('sales/sync', [SaleController::class, 'sync']);
    Route::get('sales/{id}', [SaleController::class, 'show'])->whereNumber('id');
    Route::post('sales/{id}/void', [SaleController::class, 'void'])->whereNumber('id');
    Route::post('sales/{id}/exchange', [SaleController::class, 'exchange'])->whereNumber('id');

    // Reports, expenses, audit, settings
    Route::middleware('role:admin,staff')->group(function () {
        Route::get('reports/eod', [ReportController::class, 'eod']);
        Route::get('reports/eod/series', [ReportController::class, 'series']);
        Route::get('reports/performance', [ReportController::class, 'performance']);
        Route::get('expenses', [MiscController::class, 'expenses']);
        Route::post('expenses', [MiscController::class, 'storeExpense']);
        Route::get('settings', [MiscController::class, 'settings']);
    });
    Route::middleware('role:admin')->group(function () {
        Route::get('audit', [MiscController::class, 'audit']);
        Route::put('settings/{key}', [MiscController::class, 'putSetting']);
    });
});
