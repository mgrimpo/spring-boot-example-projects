import {ButtonGroup, Navbar} from "react-bootstrap";

const React = require('react')
const ReactDOM = require('react-dom')
const client = require('./client')
const follow = require('./follow')
const {Modal} = require('react-bootstrap')
const {Button} = require('react-bootstrap')
const {Container} = require('react-bootstrap')
const when = require('when')
const stompClient = require('./websocket-listener')

const API_ROOT = "/api";

class App extends React.Component {

  constructor(props) {
    super(props);
    this.state = {
      employees: [],
      page: {number: 0},
      pageSize: 2,
      attributes: [],
      links: []
    };
    this.onCreate = this.onCreate.bind(this);
    this.onNavigate = this.onNavigate.bind(this);
    this.onDelete = this.onDelete.bind(this);
    this.updatePageSize = this.updatePageSize.bind(this);
    this.onUpdate = this.onUpdate.bind(this);
    this.refreshCurrentPage = this.refreshCurrentPage.bind(this);
    this.refreshAndGoToLastPage = this.refreshAndGoToLastPage.bind(this);
  }

  componentDidMount() {
    this.loadFromServer(this.state.pageSize);
    stompClient.register([
      {route: '/topic/newEmployee', callback: this.refreshAndGoToLastPage},
      {route: '/topic/updateEmployee', callback: this.refreshCurrentPage},
      {route: '/topic/deleteEmployee', callback: this.refreshCurrentPage}
    ]);
  }

  refreshAndGoToLastPage(message) {
    follow(client,
        API_ROOT,
        [{rel: 'employees', params: {size: this.state.pageSize}}]
    ).then(
        response => {
          if (response.entity._links.last !== undefined) {
            this.onNavigate(response.entity._links.last.href);
          } else {
            this.onNavigate(response.entity._links.self.href);
          }

        }
    )
  }

  refreshCurrentPage(message) {
    console.log(this.state)
    follow(client, API_ROOT, [{
      rel: 'employees', params: {
        page: this.state.page.number,
        size: this.state.pageSize
      }
    }]).then(
        employeeCollection => {
          this.links = employeeCollection.entity._links;
          this.page = employeeCollection.entity.page;
          console.log(employeeCollection);
          return employeeCollection.entity._embedded.employees.map(
              employee => client(
                  {method: 'GET', path: employee._links.self.href})
          )
        }
    ).then(employeePromises => {
      return when.all(employeePromises)
    }).then(employees => {
          this.setState({
            page: this.page,
            links: this.links,
            employees: employees,
            attributes: Object.keys(this.schema.properties)
          })
        }
    )
  }

  loadFromServer(pageSize) {
    follow(client, API_ROOT, [
      {rel: 'employees', params: {size: pageSize}}]
    ).then(employeeCollection => {
      return client({
        method: 'GET',
        path: employeeCollection.entity._links.profile.href,
        headers: {'Accept': 'application/schema+json'}
      }).then(schema => {
        Object.keys(schema.entity.properties).forEach(function (property) {
          if (schema.entity.properties[property].hasOwnProperty('format') &&
              schema.entity.properties[property].format === 'uri') {
            delete schema.entity.properties[property];
          } else if (schema.entity.properties[property].hasOwnProperty(
              '$ref')) {
            delete schema.entity.properties[property];
          }
        });
        this.schema = schema.entity;
        this.links = employeeCollection.entity._links;
        return employeeCollection;
      });
    }).then(employeeCollection => {
      this.page = employeeCollection.entity.page;
      return employeeCollection.entity._embedded.employees.map(employee =>
          client({
            method: 'GET',
            path: employee._links.self.href
          })
      );
    }).then(employeePromises => {
      return when.all(employeePromises);
    }).done(employees => {
      this.setState({
        employees: employees,
        attributes: Object.keys(this.schema.properties),
        page: this.page,
        pageSize: pageSize,
        links: this.links
      });
    });
  }

  onCreate(newEmployee) {
    follow(client, API_ROOT, ['employees']).then(employeeCollection => {
      return client({
        method: 'POST',
        path: employeeCollection.entity._links.self.href,
        entity: newEmployee,
        headers: {'Content-Type': 'application/json'}
      })
    })
  }

  onNavigate(navUri) {
    client({
      method: 'GET',
      path: navUri
    }).then(employeeCollection => {
      this.links = employeeCollection.entity._links;
      this.page = employeeCollection.entity.page;

      return employeeCollection.entity._embedded.employees.map(employee =>
          client({
            method: 'GET',
            path: employee._links.self.href
          })
      );
    }).then(employeePromises => {
      return when.all(employeePromises);
    }).done(employees => {
      this.setState({
        employees: employees,
        attributes: Object.keys(this.schema.properties),
        page: this.page,
        pageSize: this.state.pageSize,
        links: this.links
      });
    });
  }

  onDelete(employee) {
    console.log(employee);
    client({method: "DELETE", path: employee.entity._links.self.href}).catch(
        response => {
          console.log(response);
          if (response.status.code === 403) {
            alert(
                `DENIED: Unable to delete ${employee.entity._links.self.href} .\nYou are not authorized to delete this employee.`
            )
          }
        })
  }

  onUpdate(employee, updatedEmployee) {
    updatedEmployee.manager = employee.entity.manager;
    client({
      method: "PUT",
      path: employee.entity._links.self.href,
      entity: updatedEmployee,
      headers: {
        'Content-Type': 'application/json',
        'If-Match': employee.headers.Etag
      }
    }).then(
        response => {
          if (response.status.code === 412) {
            alert(
                `DENIED: Unable to update ${employee.entity._links.self.href} .\nYour copy is stale.`
            )
          }
        }
    ).catch(response => {
      if (response.status.code === 403) {
        alert(
            `DENIED: Unable to update ${employee.entity._links.self.href} .\nYour are not authorized to update this employee.`
        )
      }
    })
  }

  updatePageSize(pageSize) {
    if (pageSize !== this.state.pageSize) {
      this.loadFromServer(pageSize);
    }
  }

  render() {
    return (
        <Container className="border-left border-right h-100 p-0">
          <EmployeeNavbar/>
          <Container className="p-5">
          <h1 className="mb-4">Employee Management App</h1>
          <CreateDialog attributes={this.state.attributes}
                        onCreate={this.onCreate}/>
          <EmployeeList employees={this.state.employees}
                        links={this.state.links}
                        pageSize={this.state.pageSize}
                        onNavigate={this.onNavigate}
                        onDelete={this.onDelete}
                        updatePageSize={this.updatePageSize}
                        attributes={this.state.attributes}
                        onUpdate={this.onUpdate}
          />
          </Container>
        </Container>
    );
  }
}

class EmployeeNavbar extends React.Component {

  constructor(props) {
    super(props);
  }

  render() {
    return (
        <Navbar className="navbar-dark bg-primary">
          <a className="navbar-brand" href="#">Employee Managr</a>
          <span className="mr-auto"></span>
          <span className="navbar-text text-light">Currently logged in as: {authenticatedManager}</span>
        </Navbar>
    )
  }
}

class UpdateDialog extends React.Component {

  constructor(props) {
    super(props);
    this.state = {
      show: false
    }
    this.attributeRefs = {};
    this.handleSubmit = this.handleSubmit.bind(this);
    this.toggle = this.toggle.bind(this);
  }

  newAttributeRef(attribute) {
    const result = React.createRef();
    this.attributeRefs[attribute] = result;
    return result;
  }

  toggle() {
    const employeeManager = this.props.employee.entity.manager.name;
    if (employeeManager !== authenticatedManager){
      alert(`You cannot edit this employee. They are not managed by you (${authenticatedManager}), but by ${employeeManager}.`);
      return;
    }
    this.setState({
      show: !this.state.show
    })
  }

  handleSubmit(e) {
    e.preventDefault();
    const updatedEmployee = {};
    this.props.attributes.forEach(attribute => {
      updatedEmployee[attribute] = this.attributeRefs[attribute].current.value.trim();
    });
    this.props.onUpdate(this.props.employee, updatedEmployee);
    this.toggle();
  }

  render() {
    const inputs = this.props.attributes.map(attribute =>
        <p key={this.props.employee.entity[attribute]}>
          <input type="text" placeholder={attribute}
                 defaultValue={this.props.employee.entity[attribute]}
                 ref={this.newAttributeRef(attribute)}
                 className="form-control"/>
        </p>
    );

    const dialogId = "updateEmployee-"
        + this.props.employee.entity._links.self.href;

    return (
        <>
          <div key={this.props.employee.entity._links.self.href}>
            <Modal id={dialogId} show={this.state.show}
                   onHide={this.toggle}>
              <Modal.Header closeButton>
                {/*<a href="#" title="Close" className="close">X</a>*/}
                <Modal.Title>
                  <h2>Update an employee</h2>
                </Modal.Title>
              </Modal.Header>
              <Modal.Body>
                <form className="form-group">
                  {inputs}
                  <Button onClick={this.handleSubmit}>Update</Button>
                </form>
              </Modal.Body>
            </Modal>
          </div>
          <Button variant="outline-primary mx-2"
                  onClick={this.toggle}>Update</Button>
        </>
    )
  }
};

class CreateDialog extends React.Component {

  constructor(props) {
    super(props);
    this.attributeRefs = {};
    this.state = {
      show: false
    }
    this.handleSubmit = this.handleSubmit.bind(this);
    this.toggle = this.toggle.bind(this);
  }

  handleSubmit(event) {
    event.preventDefault();
    const newEmployee = {};
    this.props.attributes.forEach(attribute => {
      newEmployee[attribute] = this.attributeRefs[attribute].current.value.trim()
    })
    this.props.onCreate(newEmployee);
    this.clearInputElements();
    this.toggle();
  }

  toggle() {
    this.setState({show: !this.state.show})
  }

  render() {
    const inputs = this.props.attributes.map(
        attribute => (
            <p className="form-group" key={attribute}>
              <input type="text" placeholder={attribute}
                     ref={this.newAttributeRef(attribute)}
                     className="form-control"/>
            </p>))
    return (
        <div>
          <Button variant="primary" onClick={this.toggle} className="my-2">
            Create new Employee
          </Button>
          <Modal show={this.state.show} onHide={this.toggle}>
            <Modal.Header closeButton>
              <Modal.Title>Create Employee </Modal.Title>
            </Modal.Header>
            <Modal.Body>
              {inputs}
              <Button onClick={this.handleSubmit}>Create</Button>
            </Modal.Body>
          </Modal>
        </div>);
    // <div>
    //   <a href="#createEmployee" data-target="#createEmployee" data-toggle="modal" >Create</a>
    //   <div id="createEmployee" className="modal fade" role="dialog">
    //   <div className="modal-dialog " role="document">
    //     <div className="modal-content">
    //       <div className="modal-header">
    //         <h2 className="modal-title">Create new employee</h2>
    //         <a href="#" title="Close" className="close" data-dismiss="modal" >X</a>
    //       </div>
    //       <div className="modal-body">
    //         <form>
    //           {inputs}
    //           <button onClick={this.handleSubmit} data-dismiss="modal">Create</button>
    //         </form>
    //       </div>
    //     </div>
    //   </div>
    //   </div>
    // </div>)
  }

  newAttributeRef(attribute) {
    const result = React.createRef();
    this.attributeRefs[attribute] = result;
    return result;
  }

  clearInputElements() {
    this.props.attributes.forEach(
        attribute => this.attributeRefs[attribute].current.value = '')
  }
}

class EmployeeList extends React.Component {
  constructor(props) {
    super(props);
    this.pageSizeRef = React.createRef();
    this.handlePageSizeChange = this.handlePageSizeChange.bind(this);
  }

  handlePageSizeChange(e) {
    e.preventDefault();
    const pageSize = this.pageSizeRef.current.value.trim();
    if (/^[0-9]$/.test(pageSize)) {
      this.props.updatePageSize(pageSize);
    } else {
      this.pageSizeRef.current.value = pageSize.substring(0,
          pageSize.length - 1);
    }
  }

  render() {
    const employeeComponents = this.props.employees.map(
        employee => <Employee key={employee.entity._links.self.href}
                              employee={employee}
                              onDelete={this.props.onDelete}
                              attributes={this.props.attributes}
                              onUpdate={this.props.onUpdate}/>
    );
    const navButtons = [];
    for (let navLink of ["first", "prev", "next", "last"]) {
      if (navLink in this.props.links) {
        navButtons.push(
            <Button className="border" key={navLink}
                    onClick={(e) => this.handleNav(e,
                        navLink)}>
              {function (link) {
                switch (link) {
                  case "prev" :
                    return "<";
                  case "next" :
                    return ">";
                  case "first" :
                    return "<<";
                  case "last" :
                    return ">>";
                }
              }(navLink)}
            </Button>)
      }
    }
    return (
        <div className="mt-4">
          <h4>List of employees</h4>
          <form>
            <label htmlFor="pageSize" className="mr-2">Page Size: </label>
            <input name="pageSize" defaultValue={this.props.pageSize}
                   type="text" ref={this.pageSizeRef}
                   onInput={this.handlePageSizeChange}/>
          </form>
          <table className="table my-2">
            <tbody>
            <tr>
              <th>First Name</th>
              <th>Last Name</th>
              <th>Description</th>
              <th>Manager</th>
              <th></th>
            </tr>
            {employeeComponents}
            </tbody>
          </table>
          <ButtonGroup>{navButtons}</ButtonGroup>
        </div>
    );
  }

  handleNav(e, navLink) {
    e.preventDefault();
    this.props.onNavigate(this.props.links[navLink].href);
  }
}

class Employee extends React.Component {
  constructor(props) {
    super(props);
    this.handleDelete = this.handleDelete.bind(this);
  }

  handleDelete() {
    this.props.onDelete(this.props.employee);
  }

  render() {
    return (
        <tr>
          <td>{this.props.employee.entity.firstName}</td>
          <td>{this.props.employee.entity.lastName}</td>
          <td>{this.props.employee.entity.description}</td>
          <td>{this.props.employee.entity.manager.name}</td>
          <td>
            {/*<ButtonGroup className="mx-2">*/}
            <UpdateDialog employee={this.props.employee}
                          attributes={this.props.attributes}
                          onUpdate={this.props.onUpdate}/>
            <Button variant="outline-danger mx-2"
                    onClick={this.handleDelete}>Delete</Button>
            {/*</ButtonGroup>*/}
          </td>
        </tr>
    )
  }
}

ReactDOM.render(<App/>, document.getElementById("react"));
