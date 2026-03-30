namespace Blagodaty.Api.Security;

public static class AppRoles
{
    public const string Member = "Member";
    public const string CampManager = "CampManager";
    public const string Admin = "Admin";

    public static IReadOnlyList<RoleDefinition> Definitions { get; } =
    [
        new(Member, "Участник", "Базовый доступ к личному кабинету, профилю и собственной заявке."),
        new(CampManager, "Координатор лагеря", "Доступ к организаторским данным по поездке и работе с участниками."),
        new(Admin, "Администратор", "Полный доступ к системе, ролям и административным разделам.")
    ];

    public static IReadOnlyCollection<string> All { get; } = Definitions
        .Select(definition => definition.Name)
        .ToArray();

    public static string? Resolve(string? roleName)
    {
        if (string.IsNullOrWhiteSpace(roleName))
        {
            return null;
        }

        return Definitions
            .FirstOrDefault(definition => string.Equals(definition.Name, roleName.Trim(), StringComparison.OrdinalIgnoreCase))
            ?.Name;
    }
}

public sealed record RoleDefinition(string Name, string Title, string Description);
