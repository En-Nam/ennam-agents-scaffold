using Microsoft.AspNetCore.Mvc;

namespace AcmeCrm.Web.Controllers;

// Classic conventional-routed MVC controller: verb attributes without templates and no
// class [Route] — served at /Orders/<Action>, NOT at "/".
public class OrdersController : Controller
{
    [HttpGet]
    public IActionResult Index() => View();

    [HttpPost]
    public IActionResult Create() => RedirectToAction("Index");
}
