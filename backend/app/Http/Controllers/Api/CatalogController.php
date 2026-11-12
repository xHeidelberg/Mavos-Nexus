<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\ApiException;
use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\Product;
use App\Models\ProductCategory;
use App\Models\ProductVariant;
use App\Models\Supplier;
use App\Services\AuditService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Branches, categories, suppliers, customers. (Products have their own controller.) */
class CatalogController extends Controller
{
    // ----- Branches -----
    public function branches() { return Branch::orderByDesc('is_main')->orderBy('name')->get(); }

    public function storeBranch(Request $r)
    {
        $d = $r->validate(['code' => 'required|string|max:10|unique:branches,code', 'name' => 'required|string|max:100',
            'address' => 'nullable|string', 'is_main' => 'sometimes|boolean']);
        $d['code'] = strtoupper($d['code']);
        $b = Branch::create($d);
        AuditService::log($r->user(), 'BRANCH_CREATED', 'branch', $b->id, null, $b->toArray());
        return response()->json($b, 201);
    }

    public function updateBranch(Request $r, Branch $branch)
    {
        $d = $r->validate(['code' => "sometimes|string|max:10|unique:branches,code,{$branch->id}", 'name' => 'sometimes|string|max:100',
            'address' => 'sometimes|nullable|string', 'is_active' => 'sometimes|boolean']);
        $old = $branch->toArray();
        $branch->update($d);
        AuditService::log($r->user(), 'BRANCH_UPDATED', 'branch', $branch->id, $old, $branch->toArray());
        return $branch;
    }

    // ----- Categories: how an item is identified (vape, apparel, ...) -----
    public function categories() { return ProductCategory::where('is_active', true)->orderBy('name')->get(); }

    private function categoryRules(bool $create): array
    {
        $s = $create ? 'required' : 'sometimes';
        return [
            'name' => "$s|string|max:60",
            'tracks_expiry' => 'sometimes|boolean',
            'default_shelf_life_months' => 'sometimes|nullable|integer|min:1|max:240',
            'has_variants' => 'sometimes|boolean',
            'variant_options' => 'sometimes|nullable|array',
            'variant_options.*' => 'string|max:30',
            'is_active' => 'sometimes|boolean',
        ];
    }

    public function storeCategory(Request $r)
    {
        $d = $r->validate($this->categoryRules(true) + []);
        $r->validate(['name' => 'unique:product_categories,name']);
        $c = ProductCategory::create($d);
        AuditService::log($r->user(), 'CATEGORY_CREATED', 'category', $c->id, null, $c->toArray());
        return response()->json($c, 201);
    }

    public function updateCategory(Request $r, ProductCategory $category)
    {
        $d = $r->validate($this->categoryRules(false));
        $old = $category->toArray();
        $category->update($d);
        AuditService::log($r->user(), 'CATEGORY_UPDATED', 'category', $category->id, $old, $category->toArray());
        return $category;
    }

    // ----- Suppliers -----
    public function suppliers() { return Supplier::where('is_active', true)->orderBy('name')->get(); }

    public function storeSupplier(Request $r)
    {
        $d = $r->validate(['name' => 'required|string|max:120', 'contact_person' => 'nullable|string|max:100',
            'contact_number' => 'nullable|string|max:30', 'address' => 'nullable|string']);
        $s = Supplier::create($d);
        AuditService::log($r->user(), 'SUPPLIER_CREATED', 'supplier', $s->id);
        return response()->json($s, 201);
    }

    public function updateSupplier(Request $r, Supplier $supplier)
    {
        $d = $r->validate(['name' => 'sometimes|string|max:120', 'contact_person' => 'sometimes|nullable|string|max:100',
            'contact_number' => 'sometimes|nullable|string|max:30', 'address' => 'sometimes|nullable|string', 'is_active' => 'sometimes|boolean']);
        $old = $supplier->toArray();
        $supplier->update($d);
        AuditService::log($r->user(), 'SUPPLIER_UPDATED', 'supplier', $supplier->id, $old, $supplier->toArray());
        return $supplier;
    }

    // ----- Customers (contact number + loyalty) -----
    public function customers(Request $r)
    {
        $q = trim((string) $r->query('q', ''));
        return Customer::when($q !== '', fn ($w) => $w->where('name', 'like', "%$q%")->orWhere('contact_number', 'like', "%$q%"))
            ->orderBy('name')->limit(50)->get();
    }

    public function storeCustomer(Request $r)
    {
        $d = $r->validate(['name' => 'required|string|max:120', 'contact_number' => 'nullable|string|max:30|unique:customers,contact_number']);
        return response()->json(Customer::create($d), 201);
    }

    public function updateCustomer(Request $r, Customer $customer)
    {
        $d = $r->validate(['name' => 'sometimes|string|max:120', 'contact_number' => "sometimes|nullable|string|max:30|unique:customers,contact_number,{$customer->id}"]);
        $customer->update($d);
        return $customer;
    }
}
