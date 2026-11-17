<?php

use Illuminate\Database\QueryException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        channels: __DIR__.'/../routes/channels.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        $middleware->api(prepend: [\App\Http\Middleware\ForceJson::class]);
        $middleware->alias([
            'role' => \App\Http\Middleware\EnsureRole::class,
            'password.changed' => \App\Http\Middleware\EnsurePasswordChanged::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        // Unique / foreign-key violations become readable 409s instead of 500s.
        $exceptions->render(function (QueryException $e, $request) {
            if ($request->is('api/*') && in_array((string) $e->getCode(), ['23000'], true)) {
                return response()->json(['error' => 'Duplicate value or record is in use'], 409);
            }
        });
    })->create();
