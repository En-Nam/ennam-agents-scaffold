---
description: Scaffold a Controller + ViewModel + Razor views + EF migration + xUnit test for a new entity.
---

Usage: `/dotnet-scaffold <Entity>`

Steps:
1. Read existing files under `Controllers/`, `Models/`, `ViewModels/`, and `Views/` to learn the project's naming patterns, base classes, and folder layout (Rule 8).
2. Generate `Controllers/<Entity>sController.cs` with async `Index`, `Details`, `Create`, `Edit`, `Delete` actions returning typed `IActionResult`, primary-constructor DI, and `CancellationToken` parameters.
3. Generate `ViewModels/<Entity>ViewModel.cs` with `[Required]` / validation annotations matching the domain model — do NOT bind the EF entity directly to views.
4. Generate Razor views under `Views/<Entity>s/` (`Index.cshtml`, `Details.cshtml`, `Create.cshtml`, `Edit.cshtml`, `Delete.cshtml`) using the project's existing layout and tag helpers.
5. Add an EF migration: `dotnet ef migrations add Add<Entity> -p src/Data -s src/Web`. Do NOT run `database update` automatically — surface the command for the user.
6. Generate `tests/<Entity>sControllerTests.cs` (xUnit + FluentAssertions + `WebApplicationFactory<Program>`) covering at minimum the happy path of `Index` and `Create`.
7. Run `dotnet build` and `dotnet test` to confirm the scaffold compiles and the new tests pass.
8. Write a checkpoint summarizing files created, the pending migration, and any follow-ups.
