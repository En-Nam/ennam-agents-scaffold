using Microsoft.AspNetCore.Mvc;

namespace AcmeCrm.Web.Controllers;

public class HomeController : Controller
{
    public IActionResult Index() => View();
}
