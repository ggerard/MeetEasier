module.exports = function (callback) {

  // modules -------------------------------------------------------------------
  var ews = require("ews-javascript-api");
  var auth = require("../auth.js");

  // ews -----------------------------------------------------------------------
  var exch = new ews.ExchangeService(ews.ExchangeVersion.Exchange2016);
  exch.Credentials = new ews.ExchangeCredentials(auth.exchange.username, auth.exchange.password);
  exch.Url = new ews.Uri(auth.exchange.uri);


  // promise: get all room lists
  var getListOfRooms = function () {
    var promise = new Promise(function (resolve, reject) {
      exch.GetRoomLists().then((lists) => {
        var roomLists = lists.items;
        resolve(roomLists);
      });
    })
    return promise;
  };

  // promise: get all rooms in room lists
  var getRoomsInLists = function (roomLists) {
    var promise = new Promise(function (resolve, reject) {
      var roomAddresses = [];
      var counter = 0;

      roomLists.forEach(function (item, i, array) {
        exch.GetRooms(new ews.Mailbox(item.Address)).then((rooms) => {
          rooms.forEach(function (roomItem, roomIndex, roomsArray) {
            var room = {};

            // if the email addresses != your corporate domain,
            // replace email domain with domain
            var email = roomItem.Address;
            email = email.substring(0, email.indexOf('@'));
            email = email + '@' + auth.domain + '.com';

            var roomAlias = roomItem.Name.toLowerCase().replace(/\s+/g, "-");

            room.Roomlist = item.Name;
            room.Name = roomItem.Name;
            room.RoomAlias = roomAlias;
            room.Email = email;
            roomAddresses.push(room);

          });
          counter++;

          if (counter === array.length) {
            resolve(roomAddresses);
          }
        })
      });

    });
    return promise;
  };

  // promise: get current or upcoming appointments for each room
  var getAppointmentsForRooms = function (roomAddresses) {
    var promise = new Promise(function (resolve, reject) {
      var itemsProcessed = 0;

      roomAddresses.forEach(function(room, index, array){
        var calendarFolderId = new ews.FolderId(ews.WellKnownFolderName.Calendar, new ews.Mailbox(room.Email));
        var view = new ews.CalendarView(ews.DateTime.Now, new ews.DateTime(ews.DateTime.Now.TotalMilliSeconds + ews.TimeSpan.FromHours(240).asMilliseconds()), 6);
        exch.FindAppointments(calendarFolderId, view).then((response) => {

          var appointments = response.Items;
          var appointment = appointments[0];

          if (appointments) {
            room.Appointments = [];
            appointments.forEach(function(appt, index, array) {
              // get start time from appointment
              var start = processTime(appt.Start.momentDate);
              var end = processTime(appt.End.momentDate);
              var now = Date.now();

              if(index === 0) {
                if (start < now && now < end) {
                  room.Busy = true;
                }
                else {
                  room.Busy = false;
                }
              }

              room.Appointments.push({
                "Subject" : appt.Subject,
                "Organizer" : appt.Organizer.Name,
                "Start" : start,
                "End"   : end
              });
            });
          }

          itemsProcessed++;

          if (itemsProcessed === array.length) {
            roomAddresses.sort(sortByRoomName);
            resolve(roomAddresses);
          }
        }, (error) => {
          // handle the error here
          callback(error, null);
        });
      });
    });
    return promise;
  };

  // do all of the process for the appointment times
  function processTime(appointmentTime) {
    var time = JSON.stringify(appointmentTime);
    time = time.replace(/"/g,"");
    var time = new Date(time);
    var time = time.getTime();

    return time;
  }

  // function to sort by room name
  function sortByRoomName(a, b) {
    var nameA = a.Name.toLowerCase();
    var nameB = b.Name.toLowerCase();
      if (nameA < nameB) //sort string ascending
        return -1;
      if (nameA > nameB)
        return 1;
    return 0; //default return value (no sorting)
  }

  getListOfRooms()
  .then(getRoomsInLists)
  .then(getAppointmentsForRooms)
  .then(function(rooms){
      callback(null, rooms);
  });



};
