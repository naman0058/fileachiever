var routes = 'programming_language'
start()
let programms = []
$('.submit').click(function(){
    if($('#name').val() == "" || $('#name').val()==[] || $('#name').val()=="null" || $('#name').val()==null) alert("Enter Programming Name...");
    else if($('#description').val()=="" || $('#description').val()==[] || $('#description').val()==null || $('#description').val()=="null") alert("Enter Description...");
    else{
      let insertobj = {
          name : $('#name').val(),
          description: $('#description').val(),
          description2 : $('#description2').val(),
          description3 : $('#description3').val(),
          description4 : $('#description4').val(),
          description5 : $('#description5').val(),

      }
      $.post(`${routes}/insert`,insertobj,data=>{
          alert("Successfully...")
      })
    }

})
$('.show').click(function(){
    $.get(`${routes}/all`,data=>{
        programms = data;
        maketable(data);
    })
})
var maketable = (data) =>{
    let table = `<table class="table">
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
   $('#pname').val(result.name)
   $('#pdescription').val(result.description)
   $('#pdescription2').val(result.description2)
   $('#pdescription3').val(result.description3)
   $('#pdescription4').val(result.description4)
   $('#pdescription5').val(result.description5)
   $('.back').hide()
   $('.back1').show()

 })
$('.update').click(function(){  //data insert in database
    let updateobj = {
        id: $('#pid').val(),
        name: $('#pname').val(),
        description : $('#pdescription').val(),
        description2 : $('#pdescription2').val(),
        description3 : $('#pdescription3').val(),
        description4 : $('#pdescription4').val(),
        description5 : $('#pdescription5').val(),
        }

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




