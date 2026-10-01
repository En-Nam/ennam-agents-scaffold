using Microsoft.AspNetCore.Mvc;

namespace AcmeCrm.Web.Controllers;

[ApiController]
[Route("api/[controller]")]
public class CustomersController : ControllerBase
{
    [HttpGet]
    public IActionResult List() => Ok();

    [HttpGet("{id}")]
    public IActionResult Get(int id) => Ok();

    [HttpGet]
    [Route("featured")]
    public IActionResult Featured() => Ok();

    [HttpPost]
    public IActionResult Create() => Ok();

    [HttpPut("{id}", Name = "UpdateCustomer")]
    public IActionResult Update(int id) => Ok();

    [Authorize, HttpDelete("{id}")]
    public IActionResult Delete(int id) => Ok();
}
