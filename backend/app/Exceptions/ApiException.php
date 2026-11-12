<?php

namespace App\Exceptions;

use Exception;
use Illuminate\Http\JsonResponse;

/** Business-rule error that renders as { error, details } with the given HTTP status. */
class ApiException extends Exception
{
    public function __construct(string $message, public int $status = 422, public mixed $details = null)
    {
        parent::__construct($message);
    }

    public function render(): JsonResponse
    {
        return response()->json(['error' => $this->getMessage(), 'details' => $this->details], $this->status);
    }
}
