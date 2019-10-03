var routes = 'project'
start()
let programms = []

$('.show').click(function(){
    $.get(`${routes}/all`,data=>{
        programms = data;
        maketable(data);
    })
})
var maketable = (data) =>{
    let table = `<table class="table" id="myTable"> 
                     <input type="text"  class="form-control" id="myInput" onkeyup="myFunction()" placeholder="Search By Product Name.." title="Type in a name">

<br>
    <thead>
      <tr>
        <th>Programming Language</th>
        <th>Edit</th>
        <th>Delete</th>
      </tr>
    </thead>
    <tbody>`
data.map((item)=>{

 table+=`<tr>
        <td>${item.name} </td>
        <td><button type="button" class="btn btn-primary edit" id="${item.id}">Edit </button></td>
        <td><button type="button" class="btn btn-danger delete" id="${item.id}">Delete </button></td>
      </tr>`
    })
    
     
   table+=` </tbody>
  </table>`
$('.insertdiv').hide()
$('.show').hide()
$('#result').html(table)
$('#result').show()
$('.back').show()

   
}
$('#result').on('click', '.delete', function() {
    const id = $(this).attr('id')
    $.get(`${routes}/delete`,  { id }, data => {
        refresh()
    })
})
$('#result').on('click', '.edit', function() {
    const id = $(this).attr('id')
    const result = programms.find(item => item.id == id);
  console.log(result)
    $('.editdiv').show()
    $('#result').hide()
    $('.insertdiv').hide() 
    $('#pid').val(result.id)
    $('#peid').val(result.id)
   $('#pname').val(result.name)
   $('#paim').val(result.aim)
   $('#pobjective').val(result.objective)
   $('#pshort_description').val(result.short_description)
   $('#poverview').val(result.overview)
   $('#padvantage').val(result.advantage)
   $('#padvantage1').val(result.advantage1)
   $('#pseo_name').val(result.seo_name)
   $('#padvantage2').val(result.advantage2)
   $('#padvantage3').val(result.advantage3)
   $('#padvantage4').val(result.advantage4)
   $('#pworking_modules').val(result.working_modules)
   $('#pworking_modules1').val(result.working_modules1)
   $('#pworking_modules2').val(result.working_modules2)
   $('#pworking_modules3').val(result.working_modules3)
   $('#pworking_modules4').val(result.working_modules4)
   $('.back').hide()
   $('.back1').show()

 })
$('.update').click(function(){  //data insert in database
    
    let updateobj = {
        id: $('#pid').val(),
        name: $('#pname').val(),
        aim : $('#paim').val(),
        overview : $('#poverview').val(),
        objective : $('#pobjective').val(),
        advantage : $('#padvantage').val(),
        advantage1 : $('#padvantage1').val(),
        advantage2 : $('#padvantage2').val(),
        advantage3 : $('#padvantage3').val(),
        advantage4 : $('#padvantage4').val(),
        short_description : $('#pshort_description').val(),
        working_modules : $('#pworking_modules').val(),
        working_modules1 : $('#pworking_modules1').val(),
        working_modules2 : $('#pworking_modules2').val(),
        working_modules3 : $('#pworking_modules3').val(),
        working_modules4 : $('#pworking_modules4').val(),
        seo_name :  ($('#pname').val().split(' ').join('-')).toLowerCase()
        }
console.log(updateobj)
    $.post(`${routes}/update`, updateobj , function(data) {  
update()                  
       
    })
})
//////////////////////Function Starts//////////////////////////////////////
function start(){
$('#result').hide();
$('.editdiv').hide()
$('.back').hide()
$('.back1').hide()
}
var refresh = () =>{
    $.get(`${routes}/all`,data=>{
        maketable(data);
    })
}
var update = () =>{
    $('#result').show()
    $('.editdiv').hide()
    $('.insertdiv').show() 
    refresh()
}
$('.back').click(function(){
    $('#result').hide()
    $('.insertdiv').show()
    $('.editdiv').hide()
    $('.back1').hide()
    $('.back').hide()
})
$('.back1').click(function(){
    $('#result').show()
    $('.insertdiv').hide()
    $('.editdiv').hide()
    $('.back').show()
    $('.back1').hide()
})

function myFunction() {
    var input, filter, table, tr, td, i, txtValue;
    input = document.getElementById("myInput");
    filter = input.value.toUpperCase();
    table = document.getElementById("myTable");
    tr = table.getElementsByTagName("tr");
    for (i = 0; i < tr.length; i++) {
      td = tr[i].getElementsByTagName("td")[0];
      if (td) {
        txtValue = td.textContent || td.innerText;
        if (txtValue.toUpperCase().indexOf(filter) > -1) {
          tr[i].style.display = "";
        } else {
          tr[i].style.display = "none";
        }
      }
    }
  }



